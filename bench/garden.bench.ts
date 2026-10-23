import { beforeAll, describe, test } from "vitest";
import { DAY_MS } from "../src/core/dates";
import { deserializeGardenData, serializeGardenData } from "../src/core/persistence";
import { createCard } from "../src/core/scheduler";
import { buildQueueForSettings, computeStats } from "../src/core/stats";
import { Card, DEFAULT_SETTINGS, GardenData } from "../src/core/types";
import { buildGardenLayout } from "../src/garden/layout";
import { buildPlantModel } from "../src/garden/plantModel";
import { GardenStore } from "../src/store/cardStore";
import { FakeAdapter, fakeApp } from "../tests/helpers/fakeVault";

const NOW = new Date(2026, 0, 10, 10, 0, 0).getTime();
const PATH = "Spaced Repetition Garden/cards.json";
const CARD_COUNT = 1000;

let cards: Card[] = [];
let data: GardenData;
let raw = "";
let store: GardenStore;
let writeClock = NOW;

beforeAll(async () => {
  cards = Array.from({ length: CARD_COUNT }, (_, index) => {
    const base = createCard({
      id: `srg-${index.toString(16).padStart(8, "0")}`,
      file: `Notes/Note ${index % 100}.md`,
      anchor: { type: "block", blockId: `blk${index}` },
      title: `Plant ${index}`,
      now: NOW - index * 1000,
    });
    return {
      ...base,
      reps: index % 8,
      lapses: index % 3,
      interval: 1 + (index % 60),
      due: NOW + ((index % 9) - 3) * DAY_MS,
      firstReview: index % 4 === 0 ? null : NOW - 10 * DAY_MS,
      lastReview: index % 4 === 0 ? null : NOW - DAY_MS,
      missing: index % 97 === 0,
      suspended: index % 53 === 0,
      updatedAt: NOW - index,
    };
  });

  data = {
    version: 2,
    cards: Object.fromEntries(cards.map((card) => [card.id, card])),
    daily: {},
  };
  for (let offset = 0; offset < 365; offset++) {
    const day = new Date(NOW - offset * DAY_MS);
    data.daily[day.toISOString().slice(0, 10)] = {
      reviews: 10 + (offset % 30),
      again: offset % 7,
    };
  }
  raw = serializeGardenData(data);

  const adapter = new FakeAdapter();
  store = new GardenStore(fakeApp(adapter), PATH);
  await store.load();
  for (const card of cards) store.upsert(card);
  await store.flush();
});

describe("1000-card garden", () => {
  test("core operations", async ({ bench }) => {
    await bench.compare(
      bench("build the daily queue", () => {
        buildQueueForSettings(cards, NOW, DEFAULT_SETTINGS);
      }),
      bench("compute stats", () => {
        computeStats(cards, data.daily, NOW, DEFAULT_SETTINGS);
      }),
      bench("build every plant model", () => {
        for (const card of cards) buildPlantModel(card, NOW, DEFAULT_SETTINGS.dayStartHour);
      }),
      bench("lay out the garden", () => {
        buildGardenLayout(
          cards.map((card) => buildPlantModel(card, NOW, DEFAULT_SETTINGS.dayStartHour)),
        );
      }),
      bench("serialize the garden", () => {
        serializeGardenData(data, true);
      }),
      bench("deserialize the garden", () => {
        deserializeGardenData(raw);
      }),
    );
  });

  test("whole-file write", async ({ bench }) => {
    await bench(
      "merge and write the whole file after one edit",
      { time: 1000, iterations: 5 },
      async () => {
        writeClock += 1;
        store.upsert({ ...cards[0], updatedAt: writeClock });
        await store.flush();
      },
    ).run();
  });
});
