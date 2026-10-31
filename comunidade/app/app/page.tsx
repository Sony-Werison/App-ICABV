import type {Metadata,Viewport} from 'next';
import Platform from '../../features/icabv/platform';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#991b1b'};
export const metadata:Metadata={title:'ICABV | Igreja Cristã no Alto da Boa Vista',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'ICABV'},icons:{apple:'/logo-icabv.png'}};
export default function Page(){return <Platform/>;}
