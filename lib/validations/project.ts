import { z } from "zod";

const dateField = z.coerce.date({ error: "Format tanggal tidak valid" });

export const projectStatusEnum = z.enum(["draft", "in_progress", "done"]);

export const READONLY_PROJECT_FIELDS = ["status", "completionProgress", "completion_progress"];

export function findReadonlyProjectField(body: Record<string, unknown>): string | null {
  return READONLY_PROJECT_FIELDS.find((field) => field in body) ?? null;
}

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(255),
    startDate: dateField,
    endDate: dateField,
    dependsOn: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "end_date harus >= start_date",
    path: ["endDate"],
  });

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(255).optional(),
    startDate: dateField.optional(),
    endDate: dateField.optional(),
    dependsOn: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine(
    (data) =>
      !(data.startDate && data.endDate) || data.endDate >= data.startDate,
    {
      message: "end_date harus >= start_date",
      path: ["endDate"],
    },
  );

export const projectListQuerySchema = z.object({
  status: projectStatusEnum.optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
