export function RecordTitle({title}:{title:string}){
 const demo=/^\[(FICTÍCIO|DEMONSTRAÇÃO)\]\s*/i;
 return <span className="record-title">{title.replace(demo,'')}{demo.test(title)&&<span className="demo-badge">Demonstração</span>}</span>;
}
