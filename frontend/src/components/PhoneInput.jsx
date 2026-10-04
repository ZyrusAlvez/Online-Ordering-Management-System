import { useState } from 'react';
import { PHONE_MESSAGE, PHONE_PATTERN, cleanPhoneInput } from '../lib/validation.js';
import { Field, Input } from './ui.jsx';

/**
 * Mobile number field: numeric keypad on phones, only digits accepted, at most 11,
 * and a clear message until it is a full 09XXXXXXXXX number. The value it reports
 * is always digits only, ready to send to the API.
 *
 *   required   when false, an empty field is fine (but a half-typed number is not)
 */
export default function PhoneInput({ value, onChange, required = false, label = 'Mobile number', hint, ...rest }) {
  const [touched, setTouched] = useState(false);
  const typed = value ?? '';
  const invalid = typed !== '' && !PHONE_PATTERN.test(typed);
  const missing = required && typed === '';

  return (
    <Field
      label={label}
      hint={hint ?? '11 digits, e.g. 09171234567'}
      error={touched && (invalid || missing) ? (missing ? 'A mobile number is required' : PHONE_MESSAGE) : undefined}
    >
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="09171234567"
        maxLength={11}
        required={required}
        pattern="09[0-9]{9}"
        title={PHONE_MESSAGE}
        value={typed}
        onChange={(e) => onChange(cleanPhoneInput(e.target.value))}
        onBlur={() => setTouched(true)}
        aria-invalid={touched && (invalid || missing)}
        {...rest}
      />
    </Field>
  );
}
