"""Family circle helpers: Family IDs, membership and who can see whom."""
import secrets

from django.utils import timezone

from .models import Family, FamilyMember

# No 0/O/1/I so IDs are easy to read out and type.
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def member_of(user):
    """The user's FamilyMember row, created (with a fresh Family ID) on first use."""
    member = FamilyMember.objects.filter(user=user).select_related('family').first()
    if member:
        return member
    while True:
        code = ''.join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not FamilyMember.objects.filter(code=code).exists():
            return FamilyMember.objects.create(user=user, code=code)


def family_user_ids(user):
    """IDs of everyone whose community content this user may see: their family, or just themselves."""
    member = member_of(user)
    if not member.family_id:
        return [user.id]
    return list(FamilyMember.objects.filter(family_id=member.family_id).values_list('user_id', flat=True))


def ensure_family(member):
    """Put a member who has no family yet into a new one of their own."""
    if not member.family_id:
        member.family = Family.objects.create()
        member.joined_at = timezone.now()
        member.save(update_fields=['family', 'joined_at'])
    return member.family


def join_family(member, family):
    old_family_id = member.family_id
    member.family = family
    member.joined_at = timezone.now()
    member.save(update_fields=['family', 'joined_at'])
    cleanup_family(old_family_id)


def leave_family(member):
    old_family_id = member.family_id
    member.family = None
    member.joined_at = None
    member.save(update_fields=['family', 'joined_at'])
    cleanup_family(old_family_id)


def cleanup_family(family_id):
    """A family with nobody left in it is deleted (with its pending invites)."""
    if family_id and not FamilyMember.objects.filter(family_id=family_id).exists():
        Family.objects.filter(pk=family_id).delete()
