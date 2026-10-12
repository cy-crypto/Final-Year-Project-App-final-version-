export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskDto = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  deadline: string;
  done: boolean;
};

export function getTasks(): Promise<TaskDto[]>;

export function createTask(taskPayload: {
  title: string;
  description: string;
  priority: TaskPriority;
  deadline: string;
}): Promise<TaskDto>;

export function deleteTask(id: string): Promise<{ id: string }>;
