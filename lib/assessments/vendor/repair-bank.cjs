/* Repair challenges have a separate, versioned seed bank so existing questions stay reproducible. */
module.exports = function(root){
'use strict';
const ids=['expressions','functions','linear','tilde','systems','system-window','roots','vertex','trig','trig-tilde'];
const sign=n=>n<0?`- ${-n}`:`+ ${n}`,coef=n=>n===1?'':n===-1?'-':String(n),round=n=>String(Math.round(n*100)/100);
function seeded(id,L,seed=crypto.getRandomValues(new Uint32Array(1))[0],slot=0,version=1){
 if(version!==1||!Number.isInteger(L)||L<1||L>5||!['mixed',...ids].includes(id))throw Error('Invalid repair challenge.');
 let n=seed>>>0;const random=()=>{n=(n+0x6D2B79F5)>>>0;let t=Math.imul(n^(n>>>15),n|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296},rand=(a,b)=>Math.floor(random()*(b-a+1))+a,pick=a=>a[rand(0,a.length-1)];
 const topic=id==='mixed'?pick(ids):id,a=rand(2,5+L),b=rand(2,10),x=rand(2,5+L);let prompt,value,wrong=[],starter=[],inputs=[],steps=[],hint,degreeMode=false,bounds={left:-10,right:10,bottom:-10,top:10},target='expression',model={a,b,x};
 if(topic==='expressions'){
  const power=L>=3?2:1,expr=power===2?`(${a} + ${b})^2/${x}`:`(${a} + ${b})/${x}`;
  value=(a+b)**power/x;starter=[power===2?`${a}+${b}^2/${x}`:`${a}+${b}/${x}`];inputs=[expr];prompt=`Evaluate ${expr}. Round to the nearest hundredth if needed.`;wrong=[a+b**power/x];steps=['The starter divides only the last term. Its grouping does not match the problem.','Group the entire sum before applying the power or dividing. Read the result and round only at the end.'];hint='Compare which terms are inside the numerator.';model.power=power;
 }else if(topic==='functions'){
  const exp=L>=3?2:1,expr=`f(x) = ${coef(a)}x${exp===2?'^2':''} ${sign(-b)}`;
  value=a*x**exp-b;starter=[`f(x)=${a}x${exp===2?'^2':''}+${b}`,`f(${x})`];inputs=[expr,`f(${x})`];prompt=`If ${expr}, what is f(${x})?`;wrong=[a*x**exp+b];steps=['The function was entered with the wrong sign on its constant term.','Correct the definition first; the existing function evaluation will update automatically.'];hint='Compare the function definition with the problem, one sign at a time.';model.exp=exp;
 }else if(topic==='linear'||topic==='tilde'){
  const r=L>=3?-x:x,c=a*r+b,lhs=L>=4?`${a}(x - ${b})`: `${a}x + ${b}`,rhs=L>=4?a*(r-b):c,correct=lhs.replaceAll('x','r')+' ~ '+rhs;
  value=r;prompt=`Solve ${lhs} = ${rhs}. What is x?`;inputs=[correct];
  if(topic==='tilde'){starter=[`r=${r+2}`,correct];steps=['The starter defines r, so it is no longer an unknown regression parameter.','Delete the earlier r definition. Keep r undefined and read its fitted value under Regression Parameters.'];hint='Check whether the unknown already has a value on another line.';}
  else{starter=[lhs+' ~ '+rhs];steps=['The starter uses the coordinate variable x in the regression. Use an unused parameter such as r for the unknown.','Replace every x with r, keep ~, and read r under Regression Parameters. No rearranging is needed.'];hint='Check which letter is being used as the regression unknown.';}
  wrong=[r+2,-r,r-2];model={a,b,r,rhs,grouped:L>=4};
 }else if(topic==='systems'||topic==='system-window'){
  const far=topic==='system-window',sx=far?rand(60,100+L*50)*pick([-1,1]):x,sy=far?rand(60,100+L*50)*pick([-1,1]):b,c=sy-a*sx,d=sy+sx,ask=L%2?'x':'y';value=ask==='x'?sx:sy;
  inputs=[`y = ${a}x ${sign(c)}`,`y = -x ${sign(d)}`];starter=far?[...inputs]:[inputs[0],`y=x ${sign(d)}`];prompt=`The system is ${inputs[0]} and ${inputs[1]}. What is the ${ask}-coordinate of its intersection?`;
  if(far){target='window';steps=['Both equations are correct, but the intersection is outside the starting view. An offscreen crossing still exists.','Zoom out, then drag toward the crossing and zoom in again.',`An exact window is x from ${sx-20} to ${sx+20} and y from ${sy-20} to ${sy+20}.`];hint='Check both the horizontal and vertical viewing ranges.';}else{steps=['The second equation has the wrong sign on its x coefficient.','Correct the second line, then click the crossing and read the requested coordinate.'];hint='Compare the two equations with the expression list, including signs.';}
  steps.push(`The intersection is (${sx}, ${sy}).`);wrong=[-value,value+1,ask==='x'?sy:sx];model={a,sx,sy,c,d,ask,far};
 }else if(topic==='roots'){
  const k=rand(2,6+L);value=-k;starter=[`r^2 \\sim ${k*k}`];inputs=[`y = x^2 - ${k*k}`];prompt=`What is the smaller real solution of x^2 = ${k*k}?`;steps=['A single ~ regression can report just one fitted solution. It does not list every root of a nonlinear equation.','Graph both sides, or graph their difference as shown above. Click both x-intercepts before choosing the smaller root.',`The roots are -${k} and ${k}.`];hint='Does the method in the starter show every real solution?';wrong=[k,0,k*k];model={k};
 }else if(topic==='vertex'){
  const h=rand(2,5+L),k=-b;value=h;starter=[`y=${a}(x+${h})^2${sign(k)}`];inputs=[`y = ${a}(x - ${h})^2 ${sign(k)}`];prompt=`What is the x-coordinate of the vertex of ${inputs[0]}?`;steps=['The starter has the wrong sign inside the parentheses, which shifts the vertex in the opposite direction.','Correct the sign, adjust the view if needed, and click the vertex.',`The vertex is (${h}, ${k}).`];hint='Compare the sign inside the parentheses with the original equation.';wrong=[-h,k,a];model={a,h,k};
 }else{
  const angle=pick([20,30,40,50,60,70,78]),length=rand(5,12+L*3),fn=L===1?'sin':L===2?'cos':pick(['sin','cos','tan']),den=L>=4,ratio=Math[fn](angle*Math.PI/180),rhs=den?`${length}/x`:`x/${length}`,input=`${fn}(${angle}) ~ ${den?`${length}/m`:`m/${length}`}`;
  value=den?length/ratio:length*ratio;inputs=[input];prompt=`In a right triangle, ${fn}(${angle}°) = ${rhs}. Find the positive side length x, rounded to the nearest hundredth.`;
  if(topic==='trig'){starter=[input];target='angle';steps=['The starter evaluates the angle in radians, but the problem gives degrees.','Open Graph Settings and select Degrees. Keep the ratio as written; ~ solves for the undefined m.'];hint='Check the calculator’s angle setting against the unit in the problem.';}
  else{degreeMode=true;starter=[`m=${length+1}`,input];steps=['Degrees is already selected, but m is defined on an earlier line. That prevents it from being fitted as an unknown.','Delete the m definition. Keep the original fraction and ~, then read m under Regression Parameters.'];hint='Check whether m is an undefined parameter.';}
  steps.push(`Read m ≈ ${round(value)}. Round only the final answer and check it in the original ratio.`);wrong=[den?length*ratio:length/ratio,Math[fn](angle)*length,length];model={angle,length,fn,den};
 }
 const answer=round(value),distractors=[...new Set([...wrong,value+1,value-1,value+2,value+3].filter(Number.isFinite).map(round))].filter(v=>v!==answer).slice(0,3),choices=distractors.map(text=>({text,correct:false,mistake:'Compare your repaired setup with the walkthrough.'}));choices.splice(slot,0,{text:answer,correct:true,mistake:''});
 return {topic,name:root.QAS.topics.find(t=>t.id===topic).name,level:L,prompt,answer,choices,inputs,steps,hint,visual:'',model:{...model,value},repair:{version:1,expressions:starter.map((latex,i)=>({id:'repair-'+i,latex:latex.replaceAll('~','\\sim').replace(/\b(sin|cos|tan)\(/g,'\\$1(')})),degreeMode,bounds,target},kind:'repair',seed,seedTopic:id,slot,bankVersion:1,signature:'repair-v1|'+topic+'|'+L+'|'+prompt+'|'+JSON.stringify(starter)};
}
root.QAS.repairTopics=ids.map(id=>root.QAS.topics.find(t=>t.id===id));root.QAS.repairSeeded=seeded;
};
