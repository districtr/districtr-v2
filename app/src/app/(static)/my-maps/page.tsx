import {redirect} from 'next/navigation';

// Catalog replaced My Maps; keep this route working for existing links/bookmarks.
export default function MapsPage() {
  redirect('/catalog');
}
