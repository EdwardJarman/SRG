import { DAY_MS, logicalDayStart } from "../core/dates";
import { Card } from "../core/types";
import { fnv1a32, mulberry32 } from "../utils/random";

export type PlantStage = "seed" | "sprout" | "growing" | "established";
export type PlantCondition = "blooming" | "healthy" | "wilting";

export interface PlantModel {
  card: Card;
  stage: PlantStage;
  condition: PlantCondition;
  overdueDays: number;
  daysUntilDue: number;
  hue: number;
  seed: number;
  size: number;
  swaySpeed: number;
  swayPhase: number;
}

export function cardStage(card: Card): PlantStage {
  if (card.reps === 0) return "seed";
  if (card.reps === 1) return "sprout";
  if (card.reps <= 3) return "growing";
  return "established";
}

export function cardCondition(
  card: Card,
  now: number,
  dayStartHour: number,
): { condition: PlantCondition; overdueDays: number; daysUntilDue: number } {
  const daysUntilDue = Math.round((card.due - logicalDayStart(now, dayStartHour)) / DAY_MS);
  if (daysUntilDue < 0) return { condition: "wilting", overdueDays: -daysUntilDue, daysUntilDue };
  if (daysUntilDue <= 1) return { condition: "blooming", overdueDays: 0, daysUntilDue };
  return { condition: "healthy", overdueDays: 0, daysUntilDue };
}

export function buildPlantModel(card: Card, now: number, dayStartHour: number): PlantModel {
  const seed = fnv1a32(card.id);
  const rng = mulberry32(seed);
  const warm = rng() < 0.65;
  const hue = warm ? rng() * 70 : 265 + rng() * 85;
  const { condition, overdueDays, daysUntilDue } = cardCondition(card, now, dayStartHour);

  return {
    card,
    stage: cardStage(card),
    condition,
    overdueDays,
    daysUntilDue,
    hue,
    seed,
    size: 0.8 + rng() * 0.45,
    swaySpeed: 0.55 + rng() * 0.7,
    swayPhase: rng() * Math.PI * 2,
  };
}

export function plantStatusText(model: PlantModel): string {
  if (model.card.missing) return "Note missing - held back";
  if (model.stage === "seed") {
    return model.daysUntilDue <= 0 ? "Seed - ready to plant" : `Seed - due in ${model.daysUntilDue}d`;
  }
  const stage: Record<PlantStage, string> = {
    seed: "Seed",
    sprout: "Sprout",
    growing: "Growing",
    established: "Established",
  };
  let condition: string;
  if (model.condition === "wilting") condition = `Wilting - ${model.overdueDays}d overdue`;
  else if (model.condition === "blooming") condition = model.daysUntilDue <= 0 ? "Blooming - due today" : "Blooming - due soon";
  else condition = `Due in ${model.daysUntilDue}d`;
  return `${stage[model.stage]} - ${condition}`;
}
