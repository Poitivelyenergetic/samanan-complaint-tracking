"use client";

import { useEffect, useSyncExternalStore } from "react";

// Lets the idle cleaning crew (IdleDustWiper) "deliver" live updates to the
// dashboard's stat cards: while the crew is on screen, a card whose number
// changes (a new complaint comes in, a status changes) keeps showing its
// old value until one of them walks over and pulls its lever. Whenever the
// crew isn't on duty — i.e. someone is actually using the page — values
// pass straight through untouched.

export interface CardJob {
  id: number;
  key: string;
  to: number;
}

let onDuty = false;
let version = 0;
let nextJobId = 1;
let jobs: CardJob[] = [];
const shown = new Map<string, number>();
const flips = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export const crewCards = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getVersion: () => version,
  getJobs: () => jobs,
  isOnDuty: () => onDuty,

  report(key: string, value: number) {
    const current = shown.get(key);
    const pending = jobs.find((j) => j.key === key);
    if (current === undefined || !onDuty) {
      if (current !== value || pending) {
        shown.set(key, value);
        jobs = jobs.filter((j) => j.key !== key);
        emit();
      }
      return;
    }
    if (current === value) {
      if (pending) {
        jobs = jobs.filter((j) => j.key !== key);
        emit();
      }
      return;
    }
    if (pending) {
      if (pending.to === value) return;
      jobs = jobs.map((j) => (j.key === key ? { ...j, to: value } : j));
    } else {
      jobs = [...jobs, { id: nextJobId++, key, to: value }];
    }
    emit();
  },

  setOnDuty(value: boolean) {
    if (onDuty === value) return;
    onDuty = value;
    // Crew leaving (someone's back at the screen): everything they hadn't
    // got round to yet just updates immediately.
    if (!value) {
      for (const j of jobs) shown.set(j.key, j.to);
      jobs = [];
    }
    emit();
  },

  complete(id: number) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    shown.set(job.key, job.to);
    flips.set(job.key, (flips.get(job.key) ?? 0) + 1);
    jobs = jobs.filter((j) => j.id !== id);
    emit();
  },
};

/**
 * The value a stat card should display, plus a counter that bumps each
 * time the crew delivers an update (use it as a React key to replay the
 * card's flip animation).
 */
export function useCrewHeldValue(key: string, value: number): { value: number; flip: number } {
  useSyncExternalStore(crewCards.subscribe, crewCards.getVersion, crewCards.getVersion);
  useEffect(() => {
    crewCards.report(key, value);
  }, [key, value]);
  const held = shown.get(key);
  return {
    value: crewCards.isOnDuty() && held !== undefined ? held : value,
    flip: flips.get(key) ?? 0,
  };
}
