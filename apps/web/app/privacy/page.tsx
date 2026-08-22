import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — WeAscend",
  description: "How WeAscend stores and processes account and progress data.",
};

export default function PrivacyPage() {
  return <main className="policy-page"><article>
    <p>WEASCEND · PRIVACY</p>
    <h1>Privacy Policy</h1>
    <span>Last updated: August 6, 2026</span>
    <h2>What WeAscend stores</h2>
    <p>WeAscend stores your account identifier, email address, display name, language, settings, attributes, skills, quests, quest notes, templates, bosses, completion history, XP transactions, and synchronization metadata.</p>
    <h2>Why the data is used</h2>
    <p>This information is used only to provide your personal progress system, synchronize it across your devices, protect your account, and operate features you request.</p>
    <h2>Who controls the data</h2>
    <p>WeAscend is operated by WeSystemLabs. Questions about privacy or deletion can be sent to <a href="mailto:wesystemlabs@gmail.com">wesystemlabs@gmail.com</a>.</p>
    <h2>Service providers</h2>
    <p>Firebase Authentication verifies your identity and creates secure, single-use account-action codes. Resend delivers verification and password-reset emails from the WeSystemLabs domain. MongoDB Atlas stores synchronized WeAscend data. When you explicitly request an AI XP estimate, appeal, or boss-step plan, the relevant quest text and instructions are sent to DeepSeek for that request. We do not send all of your WeAscend history to the AI automatically.</p>
    <h2>Local device storage</h2>
    <p>A read-only cached copy of your synchronized state may be stored on your device so that you can view recent data while offline. Cached data is separated by account.</p>
    <h2>Retention and security</h2>
    <p>Your synchronized data is retained while your account remains active or until you delete it. To limit email abuse, WeAscend temporarily stores a hashed request identifier, message type, request count, and timestamps for up to 48 hours; it does not store the email message or action link in that record. We use authenticated HTTPS requests, verified Firebase identity tokens, per-user database keys, and server-only service credentials. No internet service can guarantee absolute security.</p>
    <h2>Deletion and export</h2>
    <p>You can export your data from Settings. You can permanently delete your account and associated synchronized data from Settings or through the deletion page below. Deletion removes the account profile, progress state, AI usage counters, and Firebase sign-in account. A device may retain a cache until the deletion flow clears it or the device&apos;s site data is removed.</p>
    <h2>Children</h2>
    <p>WeAscend is not directed to children under 13, and WeSystemLabs does not knowingly collect their personal data.</p>
    <h2>Changes</h2>
    <p>If this policy materially changes, the date above will be updated. Continued use after a change means the revised policy applies from its stated date.</p>
    <div className="policy-links"><Link href="/delete-account">Delete account</Link><Link href="/terms">Terms of Service</Link><Link href="/">Return to WeAscend</Link></div>
  </article></main>;
}
