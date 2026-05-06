import type { RecordDef } from "@engine/types";

export const RECORDS: RecordDef[] = [
  {
    id: "hits",
    label: "Career Hits",
    milestones: [500, 1000, 2000, 3000],
    milestoneLabel: (n) => `${n.toLocaleString()} career hits`,
  },
  {
    id: "homeRuns",
    label: "Career Home Runs",
    milestones: [50, 100, 250, 500, 700],
    milestoneLabel: (n) => `${n} career home runs`,
  },
  {
    id: "stolenBases",
    label: "Career Stolen Bases",
    milestones: [100, 300, 500],
    milestoneLabel: (n) => `${n} career stolen bases`,
  },
  {
    id: "allStars",
    label: "All-Star Selections",
    milestones: [1, 5, 10],
    milestoneLabel: (n) => (n === 1 ? "First All-Star selection" : `${n} All-Star selections`),
  },
  {
    id: "mvps",
    label: "MVP Awards",
    milestones: [1, 3],
    milestoneLabel: (n) => (n === 1 ? "First MVP award" : `${n} MVP awards`),
  },
];
