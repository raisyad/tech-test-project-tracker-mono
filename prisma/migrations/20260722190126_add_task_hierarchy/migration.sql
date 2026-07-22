-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `parent_task_id` BIGINT UNSIGNED NULL;

-- CreateIndex
CREATE INDEX `idx_tasks_parent` ON `tasks`(`parent_task_id`);

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
