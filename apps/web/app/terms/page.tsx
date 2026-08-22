import Link from "next/link";

export const metadata = {
  title: "Terms of Service — WeAscend",
  description: "Rules for using the WeAscend personal progress system.",
};

export default function TermsPage() {
  return <main className="policy-page"><article>
    <p>WEASCEND · TERMS</p>
    <h1>Terms of Service</h1>
    <span>Last updated: August 5, 2026</span>
    <h2>The service</h2>
    <p>WeAscend is a personal planning and self-improvement tool operated by WeSystemLabs. It helps you define quests, track completion, and maintain an XP history across your devices.</p>
    <h2>Your account</h2>
    <p>You are responsible for keeping your sign-in method secure and for activity performed through your account. Provide accurate account information and do not attempt to access another user&apos;s data.</p>
    <h2>Your content</h2>
    <p>You retain ownership of the text and progress data you enter. You allow WeAscend to process and store that content only as needed to provide synchronization, backups, account controls, and features you request.</p>
    <h2>AI suggestions</h2>
    <p>AI XP estimates and generated plans are optional suggestions, not guarantees or professional advice. You remain responsible for deciding whether a quest, reward, or plan is appropriate.</p>
    <h2>Acceptable use</h2>
    <p>Do not misuse the service, interfere with its security, automate abusive requests, upload unlawful content, or attempt to extract another person&apos;s information.</p>
    <h2>Availability</h2>
    <p>WeAscend may change during testing and may occasionally be unavailable. Export your data when you need an independent backup. The service is provided without a promise that it will always be uninterrupted or error-free.</p>
    <h2>Ending use</h2>
    <p>You may stop using WeAscend at any time and can permanently delete your account and synchronized data. WeSystemLabs may restrict abusive or security-threatening use.</p>
    <h2>Contact</h2>
    <p>Questions about these terms can be sent to <a href="mailto:wesystemlabs@gmail.com">wesystemlabs@gmail.com</a>.</p>
    <div className="policy-links"><Link href="/privacy">Privacy Policy</Link><Link href="/delete-account">Delete account</Link><Link href="/">Return to WeAscend</Link></div>
  </article></main>;
}
