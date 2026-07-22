import { z } from "zod";
import { projectStatusEnum } from "@/lib/validations/project";

export const createTaskSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Nama wajib diisi").max(255),
  status: projectStatusEnum.default("draft"),
  weight: z.coerce.number().int().positive("weight harus lebih dari 0"),
  dependsOn: z.array(z.coerce.number().int().positive()).optional(),
});

export const updateTaskSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Nama wajib diisi").max(255).optional(),
  status: projectStatusEnum.optional(),
  weight: z.coerce.number().int().positive("weight harus lebih dari 0").optional(),
  dependsOn: z.array(z.coerce.number().int().positive()).optional(),
});

export const taskListQuerySchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  status: projectStatusEnum.optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
