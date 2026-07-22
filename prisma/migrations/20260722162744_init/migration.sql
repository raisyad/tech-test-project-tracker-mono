-- CreateTable
CREATE TABLE `projects` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('draft', 'in_progress', 'done') NOT NULL DEFAULT 'draft',
    `completion_progress` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_projects_schedule`(`start_date`, `end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('draft', 'in_progress', 'done') NOT NULL DEFAULT 'draft',
    `weight` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tasks_project`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_locks` (
    `id` TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `projects` ADD CONSTRAINT `chk_projects_dates` CHECK (`end_date` >= `start_date`);
ALTER TABLE `tasks` ADD CONSTRAINT `chk_tasks_weight` CHECK (`weight` > 0);

INSERT INTO `schedule_locks` (`id`) VALUES (1);

