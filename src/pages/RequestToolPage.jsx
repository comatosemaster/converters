import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import { useCurrentRoute } from '../hooks/useCurrentRoute.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import RequestToolForm from '../components/RequestToolForm.jsx';
import { tools } from '../tools/registry.js';

// /request-tool - an indexable page: people search for "online tool that
// does X", and a clear page asking for exactly that is worth finding.

export default function RequestToolPage() {
  const route = useCurrentRoute();
  useDocumentMeta(route);

  return (
    <div className="static-page prose-page request-page">
      <Breadcrumbs items={route.breadcrumbs} />
      <h1>Request a Tool</h1>
      <p className="prose-lead">
        Missing a converter, generator or calculator? Describe what you need and it may become the
        next free tool on NeatSize. Every one of the {tools.length} tools here started as a problem
        someone needed solved - and like those, a new tool will run entirely in your browser, with
        no uploads and no sign-up.
      </p>

      <RequestToolForm />

      <h2>What happens next</h2>
      <ol>
        <li>Every request is read. Popular and practical ones are planned first.</li>
        <li>
          If it can be done privately in the browser - without sending your files to a server - it
          gets built. Requests that would need an upload or an account usually can’t be.
        </li>
        <li>
          New tools appear on the <Link to="/">homepage</Link>. Tick “Email me when it ships” to get
          a note when yours goes live.
        </li>
      </ol>

      <h2>Tips for a useful request</h2>
      <ul>
        <li>Say what goes in and what should come out - for example “HEIC photos in, PDF out”.</li>
        <li>Mention the file types or sizes you work with, and anything existing tools get wrong.</li>
        <li>
          Check first that it isn’t already here: search with <kbd className="kbd">Ctrl K</kbd> or
          browse the <Link to="/">full list of tools</Link>.
        </li>
      </ul>
    </div>
  );
}
