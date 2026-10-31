"""Build a reviewable update-only plan from local source files and song snapshot."""
from pathlib import Path
import json,re,unicodedata,hashlib,uuid,difflib,collections
OUT=Path('work/cifras-lote')
FILES=json.loads((OUT/'extracted.json').read_text(encoding='utf-8'))
SONGS=json.loads((OUT/'songs-before.json').read_text(encoding='utf-8'))
def norm(s):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
CHORD=re.compile(r'(?<![\w/])(?:[A-G][#b]?(?:(?:maj|min|sus|dim|aug|add|m|M)|[0-9()+°ºb#-])*(?:/[A-G][#b]?)?|/[A-G][#b]?)(?![\w/])')
def is_chord(s):return CHORD.fullmatch(s.strip()) is not None
def convert(lines):
 result=[];lyric=[];tokens=[]
 for raw in lines:
  raw=raw.replace('\u00a0',' ').replace('♯','#').replace('♭','b').replace('\r','').rstrip()
  for line in raw.split('\n'):
   line=line.expandtabs(4).strip()
   if not line:
    result.append('');lyric.append('');continue
   # Brackets that contain stage directions must not be transposed as chords.
   line=re.sub(r'\[([^\]]*)\]',lambda m:m[0] if is_chord(m[1]) else '('+m[1]+')',line)
   probe=re.sub(r'\([^)]*\)',lambda m:m[0] if is_chord(m[0][1:-1]) else '',line)
   probe=probe.replace('[','').replace(']','')
   matches=list(CHORD.finditer(probe))
   residue=CHORD.sub('',probe)
   residue=re.sub(r'[\W\d_]+','',residue,flags=re.UNICODE)
   chord_line=bool(matches) and (len(residue)<=2 or len(matches)>=2 and len(residue)<max(14,len(matches)*3) or bool(re.match(r'(?i)^(intro|solo|interl[uú]dio|final|instrumental|baixo|cresce)\s*[:→-]',line)))
   if chord_line:
    # Existing bracket chords stay intact; plain notes become explicit tokens.
    line=re.sub(r'\[([^\]]+)\]',r'\1',line)
    line=CHORD.sub(lambda m:'['+m[0]+']',line)
    tokens.extend(re.findall(r'\[([^\]]+)\]',line))
   else:
    # Singing lines and arrangement instructions retain their exact wording.
    if not re.match(r'^\([^)]*\)\s*$',line) and (len(line.split())>=2 or norm(line) in ['aleluia','hosana']):
     lyric.append(line)
   result.append(line)
 def tidy(xs):return re.sub(r'\n{3,}','\n\n','\n'.join(xs)).strip()
 return tidy(result),tidy(lyric),tokens

def sections(f):
 ps=f['paragraphs'];name=f['file']
 if name.startswith('Cifras '):
  headings=[]
  for i,p in enumerate(ps):
   text=p['text'].strip()
   if text.endswith('É o teu povo') and ('2025' in text):headings.append((i,'É o teu povo'))
   elif text and p.get('align')=='center' and p.get('size')==28:headings.append((i,text))
 elif name=='Conferências 2026.docx':
  headings=[(i,p['text'].strip()) for i,p in enumerate(ps) if p['text'].strip() and p.get('align')=='center' and 26<=p.get('size',0)<60]
 elif name=='Conferências.docx':
  headings=[(i,p['text'].strip()) for i,p in enumerate(ps) if i>28 and norm(p['text']) in ['gloria e honra','colossenses 1 da vida o melhor','ao olhar pra cruz']]
 elif name=='HC 165 e HC 290 (Adaptados).docx':headings=[(0,'HC 165'),(23,'HC 290')]
 else:
  first_index=next((i for i,p in enumerate(ps) if p['text'].strip()),0)
  first=ps[first_index]['text'].strip() if ps else ''
  stem=re.sub(r'\.docx$','',Path(name).stem,flags=re.I)
  stem_clean=re.sub(r'\s+-\s+(CityAlight|Shane.*)$','',stem,flags=re.I)
  following=next((p['text'].strip() for p in ps[first_index+1:] if p['text'].strip()),'')
  first_is_title=bool(first) and (bool(re.match(r'(?i)^(intro|tom)\s*:',following)) or difflib.SequenceMatcher(None,norm(first),norm(stem_clean)).ratio()>.78 or ps[first_index].get('align')=='center' and ps[first_index].get('size',0)>=28)
  return [(first if first_is_title else stem,ps[first_index+1:] if first_is_title else ps)]
 result=[]
 for j,(i,title) in enumerate(headings):
  end=headings[j+1][0] if j+1<len(headings) else len(ps)
  # Exclude repeated compilation cover pages between songs.
  body=[p for p in ps[i+1:end] if p.get('size',0)<60]
  while body and norm(body[-1]['text']) in ['2025','conferencias','da','igreja crista','do alto da boa vista','']:body.pop()
  result.append((title,body))
 return result

overrides=json.loads((OUT/'manual-transcriptions.json').read_text(encoding='utf-8')) if (OUT/'manual-transcriptions.json').exists() else {}
segments=[]
for f in FILES:
 if f['file'] in overrides:
  o=overrides[f['file']];f={**f,'paragraphs':[{'text':s} for s in o['text'].split('\n')]}
 for index,(title,ps) in enumerate(sections(f)):
  if not ps:continue
  sheet,lyrics,tokens=convert([p['text'] for p in ps])
  if re.search(r'(?i)capo|viol[aã]o|guita',title):sheet=title+'\n\n'+sheet
  if len(sheet)<40:continue
  segments.append({'source':f['file'],'sha256':f['sha256'],'segment':index,'title':title,'sheet':sheet,'lyrics':lyrics,'tokens':tokens,'manual':f['file'] in overrides})

def base_title(s):
 s=re.sub(r'\.(docx|pdf)$','',s,flags=re.I)
 s=re.sub(r'^(?:Cópia de\s+)?(?:HC|Hino)\s*0*(\d+)\s*[-–—]?\s*','',s,flags=re.I)
 s=re.sub(r'^\d{1,3}(?:\s*v[.]?\d+)?\s*[-–—]\s*','',s)
 s=re.sub(r'^\d{2}\s+','',s)
 s=re.sub(r'\([^)]*\)|\[[^]]*\]','',s)
 s=re.sub(r'\s+-\s+(?:CityAlight|Shane.*|[A-G])$','',s,flags=re.I)
 return norm(s)
def grams(s):return set(zip(*(norm(s).split()[i:] for i in range(3))))
song_grams={s['id']:grams(s['lyrics']) for s in SONGS}
mapping=json.loads((OUT/'mapping.json').read_text(encoding='utf-8')) if (OUT/'mapping.json').exists() else {}
review=[]
for seg in segments:
 key=f"{seg['source']}#{seg['segment']}"
 if 'title:'+seg['title'] in mapping:seg['song_id']=mapping['title:'+seg['title']]
 elif key in mapping:seg['song_id']=mapping[key]
 elif seg['source'] in mapping:seg['song_id']=mapping[seg['source']]
 else:
  exact=[s for s in SONGS if not s['archived'] and (norm(s['title']) in [norm(seg['title']),base_title(seg['source']),base_title(seg['title'])] or base_title(s['title']) in [base_title(seg['source']),base_title(seg['title'])])]
  if len(exact)==1:seg['song_id']=exact[0]['id']
 if not seg.get('song_id'):
  g=grams(seg['lyrics']);candidates=[]
  for s in SONGS:
   if s['archived']:continue
   title=max(difflib.SequenceMatcher(None,base_title(s['title']),base_title(seg['title'])).ratio(),difflib.SequenceMatcher(None,base_title(s['title']),base_title(seg['source'])).ratio())
   overlap=len(g&song_grams[s['id']])/max(1,min(len(g),len(song_grams[s['id']])))
   candidates.append((max(title,overlap),s))
  candidates.sort(key=lambda pair:pair[0],reverse=True)
  review.append({'key':key,'title':seg['title'],'chords':len(seg['tokens']),'first_lyric':seg['lyrics'][:100],'candidates':[{'score':round(score,3),'id':s['id'],'title':s['title']} for score,s in candidates[:3]]})
(OUT/'segments.json').write_text(json.dumps(segments,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(segments)} conteúdos; {len(segments)-len(review)} associados; {len(review)} para revisão.')
for row in review:print(json.dumps(row,ensure_ascii=False))

def compact(text):return norm(text).replace(' ','')
def signature(sheet,tokens):
 lines=sheet.split('\n')
 if lines and '[' not in lines[0] and re.search(r'(?i)capo|viol[aã]o|guita',lines[0]):sheet='\n'.join(lines[1:])
 text=re.sub(r'\[[^\]]+\]','',sheet)
 return (tuple(tokens),compact(text))
def metadata(seg,song):
 source=seg['source'];title=seg['title'];description=source+' '+title
 labels=[]
 if re.search(r'viol[aã]o',description,re.I):labels.append('Violão')
 elif re.search(r'guita',title,re.I):labels.append('Guitarra')
 capo=re.search(r'capo(?:traste)?(?:\s+na)?\s+(\d+)',description,re.I)
 if capo:labels.append('Capotraste '+capo[1])
 elif re.search(r'(?i)capo',description):labels.append('Com capotraste')
 if 'IBAB' in source:labels.append('IBAB')
 manual=overrides.get(source,{})
 key=manual.get('musical_key')
 if not key:
  match=re.search(r'\(([A-G][#b]?m?)\)|\s-\s([A-G][#b]?m?)(?:\.docx|\.pdf)$',source)
  if match:key=next(g for g in match.groups() if g)
 if not key:
  match=re.search(r'(?i)\btom\s*:\s*([A-G][#b]?m?)',seg['sheet'])
  if match:key=match[1]
 if not key:
  match=re.search(r'[“"]([A-G][#b]?m?)[”"]',title)
  if match:
   key=match[1]
   if capo:
    notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    if key in notes:key=notes[(notes.index(key)+int(capo[1]))%12]
 if not key:
  match=re.search(r'\(([A-G][#b]?m?)\)\s*$',title)
  if match:key=match[1]
 if not key:
  match=re.search(r'\s([A-G][#b]?m?)\s*$',title)
  if match:key=match[1]
 if not key and capo:
  original=re.search(r'(?i)tom original\s*=\s*([A-G][#b]?)',title)
  if original:
   notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
   if original[1] in notes:key=notes[(notes.index(original[1])-int(capo[1]))%12]
 key=key or song['musical_key'] or 'N/A'
 if key!='N/A':labels.append(key)
 if not seg['tokens']:
  labels.insert(0,'Letra')
  if re.search(r'All |Ancient|His Mercy',source):labels.append('inglês')
 return labels,key

grouped=collections.defaultdict(list)
for seg in segments:
 if seg.get('song_id'):grouped[seg['song_id']].append(seg)
plans=[];duplicate_sources=0
for song_id,items in grouped.items():
 song=next(s for s in SONGS if s['id']==song_id)
 arrangements=[]
 # Keep genuine existing arrangements, including the previously approved pilot.
 if song.get('chord_versions'):arrangements=[dict(v) for v in song['chord_versions']]
 elif '[' in song['chords'] and song['chords']!=song['lyrics']:
  tokens=re.findall(r'\[([^\]]+)\]',song['chords'])
  if tokens and all(is_chord(t) for t in tokens):
   arrangements=[{'id':str(uuid.uuid5(uuid.NAMESPACE_URL,song_id+':existing')),'name':'v.1','musical_key':song['musical_key'],'chords':song['chords'],'lyrics':song['lyrics'],'source_files':[],'source_hashes':[]}]
 signatures=[signature(a['chords'] or a['lyrics'],re.findall(r'\[([^\]]+)\]',a['chords'])) for a in arrangements]
 for seg in sorted(items,key=lambda s:(not s['source'].endswith('.docx'),s['source'],s['segment'])):
  labels,key=metadata(seg,song);sig=signature(seg['sheet'],seg['tokens'])
  match=None
  for i,previous in enumerate(signatures):
   if sig==previous or sig[0]==previous[0] and difflib.SequenceMatcher(None,sig[1],previous[1]).ratio()>.985:
    match=i;break
  if match is not None:
   a=arrangements[match];duplicate_sources+=1
   if labels and not a['name']:a['name']=' · '.join(labels)
   if key!='N/A' and a['musical_key']=='N/A':a['musical_key']=key
   a['source_files']=sorted(set(a.get('source_files',[])+[seg['source']]))
   a['source_hashes']=sorted(set(a.get('source_hashes',[])+[seg['sha256']]))
   continue
  identity=hashlib.sha256((str(sig[0])+sig[1]).encode()).hexdigest()
  arrangements.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,song_id+':'+identity)),'name':' · '.join(labels),'musical_key':key,'chords':seg['sheet'] if seg['tokens'] else '', 'lyrics':seg['lyrics'] if seg['tokens'] else seg['sheet'],'source_files':[seg['source']],'source_hashes':[seg['sha256']]})
  signatures.append(sig)
 # Number unnamed variants; repeated identified labels receive a version suffix.
 labels_count=collections.Counter(a['name'] for a in arrangements if a['name'])
 used=collections.Counter();unnamed=0
 for a in arrangements:
  if not a['name']:
   unnamed+=1;a['name']=f'v.{unnamed}'
  elif labels_count[a['name']]>1:
   used[a['name']]+=1;a['name']+=f' · v.{used[a["name"]]}'
 arrangements.sort(key=lambda a:not bool(a['chords']))
 assert len(arrangements)<=50
 primary=arrangements[0]
 plans.append({'id':song_id,'title':song['title'],'before':{k:song.get(k,[] if k=='chord_versions' else '') for k in ['chord_versions','chords','lyrics','musical_key']},'chord_versions':arrangements,'chords':primary['chords'] or song['chords'],'lyrics':song['lyrics'] or primary['lyrics'],'musical_key':primary['musical_key'] if primary['chords'] else song['musical_key']})
plans.sort(key=lambda p:norm(p['title']))
(OUT/'plan.json').write_text(json.dumps(plans,ensure_ascii=False,indent=2),encoding='utf-8')
summary={'files':len(FILES),'segments':len(segments),'matched_songs':len(plans),'versions':sum(len(p['chord_versions']) for p in plans),'multiple_versions':[{'id':p['id'],'title':p['title'],'versions':[{'name':v['name'],'files':v['source_files']} for v in p['chord_versions']]} for p in plans if len(p['chord_versions'])>1],'duplicate_sources':duplicate_sources,'unmatched':[{'file':v['key'].rsplit('#',1)[0],'title':v['title'],'has_chords':v['chords']>0} for v in review]}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ['multiple_versions','unmatched']},ensure_ascii=False))
