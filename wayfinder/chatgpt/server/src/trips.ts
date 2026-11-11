import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const tripSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  title: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        stops: z
          .array(
            z.object({
              time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              name: z.string().min(1).max(200),
              estimatedCostUsd: z.number().nonnegative(),
              notes: z.string().max(2000).default(""),
            }),
          )
          .max(100),
      }),
    )
    .max(90),
  checklist: z
    .array(z.object({ label: z.string().min(1).max(300), done: z.boolean() }))
    .max(100)
    .default([]),
});
export type Trip = z.infer<typeof tripSchema>;
const directory = () =>
  process.env.WAYFINDER_DATA_DIR ||
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share"),
    "wayfinder",
    "trips",
  );
export async function listTrips(): Promise<Trip[]> {
  let files: string[];
  try {
    files = await readdir(directory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    files
      .filter((name) => /^[a-z0-9][a-z0-9-]{0,79}\.json$/.test(name))
      .sort()
      .map(async (name) =>
        tripSchema.parse(
          JSON.parse(await readFile(join(directory(), name), "utf8")),
        ),
      ),
  );
}
export async function saveTrip(input: Trip) {
  const trip = tripSchema.parse(input);
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const temp = join(directory(), `.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(trip, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, join(directory(), `${trip.id}.json`));
  return trip;
}
