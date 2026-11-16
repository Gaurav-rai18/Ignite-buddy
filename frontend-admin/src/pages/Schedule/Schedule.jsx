import React from 'react';
import { PageIntro } from '../../components/ui/PageIntro';
import { TimetableCalendarView } from '../../components/schedule/TimetableCalendarView';

export function Schedule({ onNotify }) {
  return (
    <>
      <PageIntro
        eyebrow="IGNITE PLANNING & SCHEDULING"
        title="Schedule & Timetable Management"
        subtitle="Track, view, and publish weekly batch lecture schedules with deterministic room and lab allocations."
      />

      <TimetableCalendarView onNotify={onNotify} />
    </>
  );
}
