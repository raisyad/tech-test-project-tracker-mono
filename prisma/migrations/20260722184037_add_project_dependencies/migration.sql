-- CreateTable
CREATE TABLE `project_dependencies` (
    `project_id` BIGINT UNSIGNED NOT NULL,
    `depends_on_project_id` BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (`project_id`, `depends_on_project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_dependencies` ADD CONSTRAINT `project_dependencies_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_dependencies` ADD CONSTRAINT `project_dependencies_depends_on_project_id_fkey` FOREIGN KEY (`depends_on_project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE `project_dependencies` ADD CONSTRAINT `chk_project_dep_self` CHECK (`project_id` <> `depends_on_project_id`);

