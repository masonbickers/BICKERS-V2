import fs from "node:fs";import path from "node:path";
for(const [relative,name,outputName] of [
  ["src/app/home/page.js","homeResponsiveCss","home.layout.css"],
  ["src/app/dashboard/DashboardPageImpl.js","dashboardCalendarCss","dashboard.calendar.css"],
]){
  const file=path.resolve(relative);let source=fs.readFileSync(file,"utf8");
  const pattern=new RegExp("const "+name+" = `([\\s\\S]*?)`;\\s*"),match=source.match(pattern);if(!match)throw new Error(`Missing ${name}`);
  const css=match[1].replace(/\$\{\s*"([^"]+)"\s*\}/g,"$1");
  source=source.replace(pattern,"").replace(new RegExp(`\\s*<style>\\{${name}\\}<\\/style>`),"");
  const directiveEnd=source.indexOf("\n",source.indexOf('"use client";'))+1;
  source=`${source.slice(0,directiveEnd)}\nimport "./${outputName}";${source.slice(directiveEnd)}`;
  fs.writeFileSync(file,source);fs.writeFileSync(path.join(path.dirname(file),outputName),`${css.trim()}\n`);
  console.log(`Extracted ${name}`);
}
