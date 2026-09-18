import { Link } from 'react-router';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <article>
      <h2>Not found</h2>
      <p>That {what} doesn’t exist in this browser. Elections are stored locally on the device where they were created — use Export / Import to move them.</p>
      <Link to="/">← Back to all assemblies</Link>
    </article>
  );
}
