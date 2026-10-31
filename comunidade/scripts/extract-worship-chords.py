"""Read source documents without changing them. Run with the bundled PDF Python."""
from pathlib import Path
import hashlib,json,zipfile,xml.etree.ElementTree as ET
import pdfplumber

ROOT=Path('C:/Users/perei/apps/App Igreja/Cifras')
OUT=Path('work/cifras-lote')
OUT.mkdir(parents=True,exist_ok=True)
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
files=[]
for path in sorted(ROOT.iterdir()):
 if not path.is_file(): continue
 item={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'paragraphs':[]}
 try:
  if zipfile.is_zipfile(path):
   with zipfile.ZipFile(path) as doc:
    root=ET.fromstring(doc.read('word/document.xml'))
    for p in root.iter(W+'p'):
     text=''
     for e in p.iter():
      if e.tag==W+'t':text+=e.text or ''
      elif e.tag==W+'tab':text+='\t'
      elif e.tag in (W+'br',W+'cr'):text+='\n'
     props=p.find(W+'pPr')
     sizes=[int(x.get(W+'val','0')) for x in p.iter(W+'sz')]
     style=props.find(W+'pStyle') if props is not None else None
     align=props.find(W+'jc') if props is not None else None
     item['paragraphs'].append({'text':text,'size':max(sizes,default=0),'style':style.get(W+'val','') if style is not None else '', 'align':align.get(W+'val','') if align is not None else ''})
  elif path.suffix.lower()=='.pdf':
   with pdfplumber.open(path) as pdf:
    for page in pdf.pages:
     for line in (page.extract_text(layout=True) or '').splitlines():
      item['paragraphs'].append({'text':line.rstrip(),'page':page.page_number})
  else:item['needs_ocr']=True
  text='\n'.join(p['text'] for p in item['paragraphs'])
  item['text']=text
  if not text.strip():item['needs_ocr']=True
 except Exception as error:item['error']=str(error)
 files.append(item)
(OUT/'extracted.json').write_text(json.dumps(files,ensure_ascii=False,indent=2),encoding='utf-8')
for item in files:
 lines=[p for p in item['paragraphs'] if p['text'].strip()]
 print(json.dumps({'file':item['file'],'chars':len(item.get('text','')),'first':[p['text'].strip()[:110] for p in lines[:3]],'ocr':item.get('needs_ocr',False),'error':item.get('error')},ensure_ascii=False))
