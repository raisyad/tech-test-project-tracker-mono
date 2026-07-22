CREATE TABLE `task_dependencies` (
    `task_id` BIGINT UNSIGNED NOT NULL,
    `depends_on_task_id` BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (`task_id`, `depends_on_task_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_depends_on_task_id_fkey` FOREIGN KEY (`depends_on_task_id`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `task_dependencies` ADD CONSTRAINT `chk_task_dep_self` CHECK (`task_id` <> `depends_on_task_id`);

