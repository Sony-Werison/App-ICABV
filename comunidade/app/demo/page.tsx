import {notFound} from 'next/navigation';
import Platform from '../../features/icabv/platform';
export const dynamic='force-dynamic';
export default function Page(){if(process.env.NODE_ENV!=='development')notFound();return <Platform demo/>;}
