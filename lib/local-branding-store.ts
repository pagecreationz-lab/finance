import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type BrandingKind = 'logo'|'favicon';
const folder=()=>path.join(process.cwd(),'.local-data','branding');
const dataFile=(kind:BrandingKind)=>path.join(folder(),kind+'.bin');
const typeFile=(kind:BrandingKind)=>path.join(folder(),kind+'.type');

export async function writeLocalBranding(kind:BrandingKind,file:File){
  await mkdir(folder(),{recursive:true});
  await Promise.all([
    writeFile(dataFile(kind),Buffer.from(await file.arrayBuffer())),
    writeFile(typeFile(kind),file.type||'application/octet-stream','utf8'),
  ]);
}
export async function readLocalBranding(kind:BrandingKind){
  const [data,type]=await Promise.all([
    readFile(/* turbopackIgnore: true */ dataFile(kind)),
    readFile(/* turbopackIgnore: true */ typeFile(kind),'utf8'),
  ]);
  return {data,type};
}

