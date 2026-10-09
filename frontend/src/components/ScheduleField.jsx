import { useEffect, useState } from 'react';
import { dayLabel } from '../lib/format.js';
import { clock12 } from '../lib/geo.js';
import { canOrderNow, scheduleDays, slotsFor } from '../lib/schedule.js';
import { Field, Segmented, Select } from './ui.jsx';

/**
 * "As soon as possible" or a time slot at the chosen branch. `value` is the
 * ISO time, or null for ASAP. While the branch is closed, ASAP is not offered
 * and the first open slot is picked for them.
 */
export default function ScheduleField({ branch, value, onChange }) {
  const openNow = canOrderNow(branch);
  const [later, setLater] = useState(!openNow);
  const scheduling = later || !openNow;

  const days = scheduleDays()
    .map((day) => ({ day, slots: slotsFor(branch, day) }))
    .filter((d) => d.slots.length > 0);
  const [day, setDay] = useState(null);
  const current = days.find((d) => d.day === day) ?? days[0] ?? null;

  // Keep the answer valid as the branch, the mode or the day changes.
  const wanted = !scheduling || !current ? null : current.slots.some((s) => s.value === value) ? value : current.slots[0].value;
  useEffect(() => {
    if (wanted !== value) onChange(wanted);
  }, [wanted, value, onChange]);

  return (
    <div className="space-y-3">
      <Segmented
        value={scheduling ? 'later' : 'asap'}
        onChange={(mode) => setLater(mode === 'later')}
        options={[
          {
            value: 'asap',
            label: 'As soon as possible',
            disabled: !openNow,
            title: openNow ? undefined : `${branch.name} is closed right now`,
          },
          { value: 'later', label: 'Schedule for later' },
        ]}
      />
      {!openNow && (
        <p className="text-sm text-amber-800">
          {branch.name} is closed right now
          {branch.opens_at ? ` (opens ${clock12(branch.opens_at)})` : ''}. Choose when you want your order.
        </p>
      )}
      {scheduling &&
        (current ? (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Field label="Day">
              <Select value={current.day} onChange={(e) => setDay(e.target.value)}>
                {days.map((d) => (
                  <option key={d.day} value={d.day}>
                    {dayLabel(d.day)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Time">
              <Select value={wanted ?? ''} onChange={(e) => onChange(e.target.value)}>
                {current.slots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-brand-dark">{branch.name} has no times left in the next few days.</p>
        ))}
    </div>
  );
}
