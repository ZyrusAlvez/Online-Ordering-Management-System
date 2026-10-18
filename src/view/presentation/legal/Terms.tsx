'use client';

import { Link } from '@/utils/navigation';
import LegalPage, { SUPPORT_EMAIL, type Section } from '@/view/presentation/legal/LegalPage';

const sections: Section[] = [
  {
    title: 'About these terms',
    body: (
      <p>
        These terms apply when you order from 3K Kitchen through this website, at one of our kiosks or at the counter.
        By creating an account or placing an order you agree to them. How we handle your personal data is explained in
        our <Link to="/privacy" className="font-semibold text-brand">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate details, especially your mobile number and delivery address.</li>
        <li>Keep your password to yourself; you are responsible for orders placed with your account.</li>
        <li>You must be 18 or older to create an account.</li>
        <li>We may suspend an account that is used for fraud or abuse.</li>
      </ul>
    ),
  },
  {
    title: 'Orders and prices',
    body: (
      <ul>
        <li>Prices are in Philippine pesos and include VAT. The price that applies is the one shown when you place the order.</li>
        <li>Each branch sets what it has available; a dish may be sold out at one branch and not another.</li>
        <li>You can order for now while a branch is open, or schedule an order in 15-minute steps up to two days ahead, within its opening hours.</li>
        <li>An order is accepted when the branch confirms it. If something you ordered runs out, the branch will contact you to change or cancel it.</li>
      </ul>
    ),
  },
  {
    title: 'Payment',
    body: (
      <ul>
        <li><strong>Cash:</strong> pay at the counter, on pickup, or to the rider on delivery.</li>
        <li><strong>GCash:</strong> send the exact total to the GCash account shown with your order, then send us the reference number or a screenshot of the receipt. Your order counts as paid once our staff have checked the payment in our GCash account.</li>
        <li>If we cannot find your GCash payment, we will tell you why so you can send it again or pay in cash.</li>
      </ul>
    ),
  },
  {
    title: 'Cancellations and refunds',
    body: (
      <ul>
        <li>You can cancel an online order yourself while it is waiting or confirmed and has not been paid.</li>
        <li>After that, ask the branch through the chat. A paid order that we cancel is refunded in full.</li>
        <li>GCash refunds are sent back to the GCash number you paid from within 3 working days.</li>
        <li>If an order arrives wrong or incomplete, tell the branch the same day and we will make it right.</li>
      </ul>
    ),
  },
  {
    title: 'Delivery and pickup',
    body: (
      <ul>
        <li>Delivery is available from the branch you order from, to addresses its riders can reach. Times shown are estimates.</li>
        <li>Please keep your phone with you; the rider may call or chat with you.</li>
        <li>Pickup orders are kept for 30 minutes after they are ready.</li>
      </ul>
    ),
  },
  {
    title: 'Chat and photos',
    body: (
      <p>
        Be respectful in chats with our staff and riders. Send photos only to explain an order or a payment. We may
        remove messages that are abusive, unlawful or unrelated to an order.
      </p>
    ),
  },
  {
    title: 'Fair use',
    body: (
      <p>
        Do not place fake orders, try to change prices or payment status, access other people's accounts, or interfere
        with the website, kiosks or registers. Doing so may lead to cancelled orders, a closed account and, where it is
        a crime, a report to the authorities.
      </p>
    ),
  },
  {
    title: 'Food and allergies',
    body: (
      <p>
        Our dishes are prepared in shared kitchens and may contain or come into contact with common allergens such as
        peanuts, shellfish, eggs, soy and wheat. If you have an allergy, ask the branch before ordering.
      </p>
    ),
  },
  {
    title: 'Our responsibility',
    body: (
      <p>
        We work to keep the website available and correct, but it may sometimes be unavailable or contain mistakes.
        To the extent the law allows, our responsibility for any order is limited to the amount you paid for it.
        Nothing in these terms limits your rights under the Consumer Act of the Philippines.
      </p>
    ),
  },
  {
    title: 'Changes and contact',
    body: (
      <p>
        We may update these terms; the date at the top shows the latest version, and orders follow the terms in force
        when they were placed. These terms are governed by the laws of the Philippines. Questions? Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand">{SUPPORT_EMAIL}</a> or chat with your branch.
      </p>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={<p>The rules for ordering from 3K Kitchen, in plain language.</p>}
      sections={sections}
      other={{ to: '/privacy', label: 'Privacy Policy' }}
    />
  );
}
