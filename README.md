# Mini Project Tracker

Penjelasan: Project Tracker ini dibuat untuk memenuhi technical assesment daripada candidate Fullstack Developer yang dimana project ini berkaitan dengan manajement Project & Task.


## Stack

- Next.js (App Router) + TypeScript 
-  Tailwind CSS · Headless UI
- TanStack Query · Zod · Prisma 
- MySQL
- npm runtime for default (di awal saya akan menggunakan bun runtime, akan tetapi saya belum pernah menggunakan dan menggabungkan antara prisma dengan bun runtime maka dari itu saya menggunakan runtime default yaitu npm)

## Run on Local Development

Perlu Node.js dan Docker terpasang.

1. Copy `.env.example` jadi `.env`, isi dengan kredensial yang disesuaikan

2. Run MySQL lewat Docker:

   ```bash
   docker compose up -d
   ```

3. Install dependency:

   ```bash
   npm install
   ```

4. Jalankan migrasi database:

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. Jalankan dev server:

   ```bash
   npm run dev
   ```

Buka [http://localhost:3000](http://localhost:3000).

> Catatan: default port MySQL di `docker-compose.yml` adalah `3307` di sisi host (bukan `3306`), supaya tidak bentrok, jika sudah punya MySQL lain jalan di komputer. Kalo tidak ada bentrok, boleh diganti ke `3306` lewat env var `MYSQL_PORT`.

## Struktur Folder

```
app/
  api/          route handler (endpoint REST)
  page.tsx      satu-satunya halaman, semua UI ada di sini (SPA)
lib/
  services/     logic bisnis utama, dipisah dari route handler biar gampang di-test
  validations/  skema Zod
  services/__tests__/  unit test
prisma/
  schema.prisma  definisi tabel
  migrations/    riwayat migrasi
```

## Database

Ada 5 tabel: `projects`, `tasks`, `project_dependencies`, `task_dependencies`, sama `schedule_locks`.

- `projects` sama `tasks` relasinya 1-N biasa (satu project punya banyak task), plus `tasks` punya self-relation `parent_task_id` buat subtask.
- `project_dependencies` sama `task_dependencies` itu junction table buat relasi many-to-many self-referencing (project bisa depends-on project lain, task juga bisa depends-on task lain), dipisah dari relasi hierarki subtask karena aturannya beda.
- `schedule_locks` cuma 1 baris doang, dipakai sebagai mutex buat validasi jadwal project yang gak boleh beririsan.

Skema lengkapnya ada di `prisma/schema.prisma`.

## Testing

Ada unit test buat rule-rule domain yang agak tricky (progress calculation, dependency, hierarchy subtask, schedule overlap). Testnya langsung ke database lokal (bukan mock), jadi pastikan MySQL-nya sudah nyala dulu.

```bash
npm run test
```
