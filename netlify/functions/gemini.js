const MODEL = 'gemini-3.5-flash-lite';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const headers = {'Content-Type':'application/json','Cache-Control':'no-store'};
function reply(status,data){return {statusCode:status,headers,body:JSON.stringify(data)}}
function extractJson(text){const cleaned=text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();return JSON.parse(cleaned)}
exports.handler=async(event)=>{
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 const key=process.env.GEMINI_API_KEY;
 if(!key)return reply(503,{error:'Ключ GEMINI_API_KEY не найден в Netlify Functions'});
 if((event.body||'').length>6_000_000)return reply(413,{error:'Слишком большой запрос'});
 let input;try{input=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'Некорректный JSON'})}
 const mode=input.mode;
 let parts,prompt;
 if(mode==='answer'){
  for(const k of ['title','scenario','reference','answer'])if(typeof input[k]!=='string')return reply(400,{error:'Отсутствует поле '+k});
  if(input.answer.length<20||input.answer.length>4000)return reply(400,{error:'Ответ должен содержать от 20 до 4000 символов'});
  prompt=`Ты эксперт по учебным ситуациям охраны труда в Казахстане. Оцени ответ студента по смыслу, а не по ключевым словам. Не придумывай конкретные статьи законов. Учитывай опасные или противоправные рекомендации студента, не поощряй их. Дай 0-100 баллов по четырём критериям по 25: выявление опасности, безопасная остановка/первые действия, специфические меры, уведомление и процедуры. Если использована подсказка, вычти 5. Ответ строго JSON: {"score":число,"strengths":[строки],"missing":[строки],"feedback":"текст"}. Название: ${input.title.slice(0,250)}. Ситуация: ${input.scenario.slice(0,1400)}. Эталон (может быть неполным): ${input.reference.slice(0,2200)}. Подсказка использована: ${!!input.hinted}. Ответ студента: ${input.answer}`;
  parts=[{text:prompt}];
 }else if(mode==='photo'){
  if(!['image/jpeg','image/png','image/webp'].includes(input.mimeType)||typeof input.image!=='string'||input.image.length>5_600_000)return reply(400,{error:'Некорректное изображение (максимум 4 МБ)'});
  prompt='Проанализируй фотографию рабочего места для учебного тренажёра по охране труда. Перечисли ТОЛЬКО потенциальные видимые опасности и рекомендации. Не утверждай о нарушении закона без доказательств. Отдельно укажи, что нельзя определить по фото (вентиляция, газ, допуски, измерения, состояние систем). Строго JSON: {"hazards":[строки],"recommendations":[строки],"limitations":"текст"}. Не идентифицируй людей.';
  parts=[{text:prompt},{inline_data:{mime_type:input.mimeType,data:input.image}}];
 }else return reply(400,{error:'Неизвестный режим'});
 try{
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:1800}}),signal:AbortSignal.timeout(22000)});
  if(!r.ok){const raw=await r.text();let message='Ошибка Gemini API ('+r.status+')';if(r.status===429)message='Превышен лимит Gemini API. Попробуй позже.';if(r.status===403||r.status===401)message='Нет доступа к Gemini API: проверь ключ и проект.';return reply(502,{error:message})}
  const data=await r.json();const text=data.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('');if(!text)return reply(502,{error:'Gemini не вернул текст анализа'});
  const parsed=extractJson(text);
  if(mode==='answer'){
   if(!Number.isFinite(parsed.score)||!Array.isArray(parsed.strengths)||!Array.isArray(parsed.missing))throw Error('Неверный формат оценки');
   return reply(200,{score:Math.max(0,Math.min(100,Math.round(parsed.score))),strengths:parsed.strengths.slice(0,8).map(String),missing:parsed.missing.slice(0,8).map(String),feedback:String(parsed.feedback||'').slice(0,2500)})
  }
  if(!Array.isArray(parsed.hazards)||!Array.isArray(parsed.recommendations))throw Error('Неверный формат анализа фото');
  return reply(200,{hazards:parsed.hazards.slice(0,12).map(String),recommendations:parsed.recommendations.slice(0,12).map(String),limitations:String(parsed.limitations||'').slice(0,2000)})
 }catch(e){return reply(502,{error:e.name==='TimeoutError'?'Время ожидания Gemini истекло':'Не удалось получить корректный ответ Gemini'})}
};
