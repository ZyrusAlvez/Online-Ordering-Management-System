'use client';

import LegalPage, { CONTACT_EMAIL, type Section } from '@/view/presentation/legal/LegalPage';

const sections: Section[] = [
  {
    title: 'Who we are',
    body: (
      <>
        <p>
          3K Kitchen runs home-style Filipino restaurants across Cavite and this ordering website, kiosk and counter
          system. We decide how the personal data described here is used, so we are its controller under the Data
          Privacy Act of 2012 (Republic Act No. 10173).
        </p>
        <p>
          Our Data Protection Officer can be reached at <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand">{CONTACT_EMAIL}</a>.
        </p>
      </>
    ),
  },
  {
    title: 'What we collect',
    body: (
      <ul>
        <li><strong>Your account:</strong> your name, email address and password. Passwords are stored only as a secure hash by our login provider; we never see them. If you sign in with Google, we receive your name, email address and profile photo from Google.</li>
        <li><strong>Contact details:</strong> your mobile number, so a rider can call you about a delivery.</li>
        <li><strong>Delivery address:</strong> the address you type and, if you drop one, a pin on the map. You may save one as your default.</li>
        <li><strong>Orders:</strong> what you ordered, from which branch, when, and how you chose to receive and pay for it.</li>
        <li><strong>Payments:</strong> whether you paid in cash or by GCash. For GCash we keep the reference number and the receipt screenshot you send. We never receive your GCash PIN, balance or card details.</li>
        <li><strong>Messages:</strong> what you write to a branch or a rider in chat, and any photos you attach. Guests may give a first name; it is optional.</li>
        <li><strong>Your location:</strong> only if you allow it, and only to suggest your nearest branch or to pin your delivery address. We do not track you, and we do not keep your location unless you save it as a delivery pin.</li>
      </ul>
    ),
  },
  {
    title: 'Why we use it',
    body: (
      <ul>
        <li><strong>To take and fulfil your orders</strong>: prepare them, deliver them or hand them over, and take payment. This is needed to carry out our agreement with you.</li>
        <li><strong>To check GCash payments</strong>: staff compare your reference number or receipt with our GCash account, and send refunds when an order is cancelled after payment.</li>
        <li><strong>To answer you</strong> when you chat with a branch or your rider.</li>
        <li><strong>To keep records</strong> the law requires of a business, such as sales records.</li>
        <li><strong>To keep the service safe</strong>: stop fraud and misuse, and fix problems. This is our legitimate interest.</li>
      </ul>
    ),
  },
  {
    title: 'What we keep on your device',
    body: (
      <>
        <p>We do not use advertising or tracking cookies. The website stores only what it needs in your browser:</p>
        <ul>
          <li>your sign-in, so you stay logged in;</li>
          <li>your cart and the branch you order from;</li>
          <li>on a guest chat, a private code that lets you see your own conversation;</li>
          <li>a copy of public information, such as the menu, branch hours and our logo, kept for a few minutes so pages load faster.</li>
        </ul>
        <p>
          Your personal information (your profile, orders, payments and messages) is never saved in this copy. While
          you use the site it is kept only in the page's memory, and it is cleared the moment you sign out, so the next
          person on a shared phone or computer cannot see it.
        </p>
      </>
    ),
  },
  {
    title: 'Who we share it with',
    body: (
      <>
        <p>We do not sell your personal data. We share only what each party needs:</p>
        <ul>
          <li><strong>Branch staff</strong> see the orders, payments and chats of their own branch only.</li>
          <li><strong>Riders</strong> see the name, mobile number, address and order of the deliveries they take, only while they handle them.</li>
          <li><strong>Our hosting and database provider</strong> stores the data on our behalf, under a data processing agreement.</li>
          <li><strong>OpenStreetMap</strong> provides the maps and address search. It receives the address text you search for and the map area you view, but no account information.</li>
          <li><strong>Google</strong>, only if you choose to sign in with Google.</li>
          <li><strong>Authorities</strong>, when the law requires it.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Orders and payment records: five years, as sales records.</li>
        <li>GCash receipt screenshots: one year after the order.</li>
        <li>Chats and their photos: one year after the last message.</li>
        <li>Your account and saved address: until you ask us to delete them.</li>
      </ul>
    ),
  },
  {
    title: 'How we protect it',
    body: (
      <ul>
        <li>All connections to the website are encrypted.</li>
        <li>Staff can see only the branches they work at, and each role sees only what its job needs.</li>
        <li>Receipts and chat photos are private; they open only through links that expire after an hour.</li>
        <li>Prices and payment status are checked by our database, not your browser, so orders cannot be altered.</li>
      </ul>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <>
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul>
          <li>be informed about how your data is used (this page);</li>
          <li>access the data we hold about you, and get a copy of it;</li>
          <li>have wrong or incomplete data corrected (you can edit your name, number and address on your Profile page);</li>
          <li>object to processing, and ask us to delete or block your data;</li>
          <li>be indemnified for damages caused by wrong use of your data;</li>
          <li>file a complaint with the National Privacy Commission.</li>
        </ul>
        <p>
          To use any of these, email <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand">{CONTACT_EMAIL}</a>. We answer within 15 working days.
        </p>
      </>
    ),
  },
  {
    title: 'Children',
    body: <p>Accounts are for people aged 18 and over. Younger customers should order with a parent or guardian.</p>,
  },
  {
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy we will update the date at the top, and tell you on the website before a significant
        change takes effect.
      </p>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data 3K Kitchen collects when you order from us online, at a kiosk or at
          the counter, why we need it, who sees it, and the choices you have.
        </p>
      }
      sections={sections}
      other={{ to: '/terms', label: 'Terms of Service' }}
    />
  );
}
