import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-line mt-10">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink/40">
        <span>© {new Date().getFullYear()} FoodBridge — coordination, not charity.</span>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-ink/70 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-ink/70 transition-colors">Privacy</Link>
          <span className="font-mono text-xs">Built with React · Node.js · MongoDB</span>
        </div>
      </div>
    </footer>
  );
}
