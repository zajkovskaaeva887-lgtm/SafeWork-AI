const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
const headers = {'Content-Type':'application/json','Cache-Control':'no-store'};
function reply(status,data){return {statusCode:status,headers,body:JSON.stringify(data)}}
function extractJson(text){return JSON.parse(String(text).replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim())}
const guidance = `Ты учебный консультант по охране труда в Республике Казахстан. Отвечай на русском языке. Различай: (1) что достоверно видно/известно, (2) возможные опасности, (3) меры безопасности, (4) сведения, которые надо уточнить. Не выдумывай номера статей, высотные пороги, обязательные СИЗ, технические нормативы и ссылки. Если точную норму нельзя проверить, прямо скажи, что она требует проверки по действующим правилам РК и инструкциям работодателя. Не утверждай, что работа нарушает закон, только на основании фотографии. Не идентифицируй людей. Для работ на высоте и лестницах не заявляй универсальный порог 1,2 м без проверенного нормативного основания. Учитывай контекст и предлагай конкретные безопасные действия. Если есть непосредственная угроза, рекомендуй прекратить опасную работу и обратиться к ответственному специалисту. Ссылки допускаются только на реально известные официальные страницы adilet.zan.kz; если не уверен, оставь references пустым. JSON без Markdown.`;
exports.handler=async(event)=>{
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 const key=process.env.GEMINI_API_KEY;if(!key)return reply(503,{error:'Ключ GEMINI_API_KEY не найден в Netlify Functions'});
 if((event.body||'').length>6_000_000)return reply(413,{error:'Слишком большой запрос'});
 let input;try{input=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'Некорректный JSON'})}
 let parts,prompt;const mode=input.mode;
 if(mode==='answer'){
  for(const k of ['title','scenario','reference','answer'])if(typeof input[k]!=='string')return reply(400,{error:'Отсутствует поле '+k});
  if(input.answer.trim().length<20||input.answer.length>4000)return reply(400,{error:'Ответ должен содержать от 20 до 4000 символов'});
  prompt=`${guidance} Оцени ответ студента по смыслу, а не по ключевым словам. Оценка 0-100: выявление опасности, безопасная остановка/первые действия, специфические меры, уведомление и процедуры (по 25). За использованную подсказку вычти 5. Ответ JSON: {"score":число,"strengths":[строки],"missing":[строки],"feedback":"текст"}. Название: ${input.title.slice(0,250)}. Ситуация: ${input.scenario.slice(0,1400)}. Эталон: ${input.reference.slice(0,2200)}. Подсказка использована: ${!!input.hinted}. Ответ студента: ${input.answer}`;
  parts=[{text:prompt}];
 }else if(mode==='photo'){
  if(!['image/jpeg','image/png','image/webp'].includes(input.mimeType)||typeof input.image!=='string'||input.image.length>5_600_000)return reply(400,{error:'Некорректное изображение (максимум 4 МБ)'});
  prompt=`${guidance} Проанализируй фотографию рабочего места. Укажи только реально видимые обстоятельства и возможные риски, отдельно конкретные требования безопасной организации работы и меры предотвращения. Не путай требования с рекомендациями; не делай выводов о невидимых нарушениях. Для стремянки опиши проверку устойчивости, соответствия назначению, безопасного положения, запрет использования случайных подставок, отсутствие чрезмерного вытягивания, организацию доступа к верхним полкам и необходимость уточнить применимость защиты от падения по виду работы и действующим правилам. Ответ строго JSON: {"hazards":["..."],"safetyRequirements":["..."],"recommendations":["..."],"verification":["..."],"references":[{"name":"...","url":"https://adilet.zan.kz/...","note":"..."}],"limitations":"..."}. Максимум 8 элементов в каждом списке.`;
  parts=[{text:prompt},{inline_data:{mime_type:input.mimeType,data:input.image}}];
 }else if(mode==='question'){
  if(typeof input.question!=='string'||input.question.trim().length<10||input.question.length>2500)return reply(400,{error:'Вопрос должен содержать от 10 до 2500 символов'});
  prompt=`${guidance} Ответь на вопрос пользователя об охране труда в Казахстане. Не изображай юридическую экспертизу и не выдумывай нормативные пороги. Если вопрос содержит опасное предположение, осторожно исправь его. Строго JSON: {"answer":"понятное объяснение","actions":["конкретные меры безопасности"],"clarifications":["что зависит от условий и требует проверки"],"references":[{"name":"название официального акта","url":"https://adilet.zan.kz/...","note":"применимость или оговорка"}],"caution":"краткое ограничение"}. Вопрос: ${input.question}`;
  parts=[{text:prompt}];
 }else return reply(400,{error:'Неизвестный режим'});
 try{
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:0.2,maxOutputTokens:2400}}),signal:AbortSignal.timeout(25000)});
  if(!r.ok){const raw=await r.text();let message='Ошибка Gemini API ('+r.status+')';if(r.status===429)message='Превышен лимит Gemini API. Попробуй позже.';if(r.status===403||r.status===401)message='Нет доступа к Gemini API: проверь ключ и проект.';if(r.status===404)message='Модель Gemini не найдена: проверь переменную GEMINI_MODEL и доступность модели.';if(r.status>=500)message='Сервис Gemini временно недоступен.';return reply(502,{error:message});}
  const data=await r.json();const text=data.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('');if(!text)return reply(502,{error:'Gemini не вернул текст анализа'});
  const parsed=extractJson(text);
  if(mode==='answer'){
   if(!Number.isFinite(parsed.score)||!Array.isArray(parsed.strengths)||!Array.isArray(parsed.missing))throw Error('Неверный формат оценки');
   return reply(200,{score:Math.max(0,Math.min(100,Math.round(parsed.score))),strengths:parsed.strengths.slice(0,8).map(String),missing:parsed.missing.slice(0,8).map(String),feedback:String(parsed.feedback||'').slice(0,2500)});
  }
  const arr=(v)=>Array.isArray(v)?v.slice(0,10).map(x=>String(x).slice(0,1000)):[];
  const references=Array.isArray(parsed.references)?parsed.references.slice(0,6).filter(x=>x&&typeof x==='object').map(x=>({name:String(x.name||'Нормативный источник').slice(0,250),url:String(x.url||'').slice(0,500),note:String(x.note||'').slice(0,500)})):[];
  if(mode==='photo'){
   if(!Array.isArray(parsed.hazards)||!Array.isArray(parsed.recommendations))throw Error('Неверный формат анализа фото');
   return reply(200,{hazards:arr(parsed.hazards),safetyRequirements:arr(parsed.safetyRequirements),recommendations:arr(parsed.recommendations),verification:arr(parsed.verification),references,limitations:String(parsed.limitations||'').slice(0,2000)});
  }
  if(typeof parsed.answer!=='string')throw Error('Неверный формат ответа');
  return reply(200,{answer:parsed.answer.slice(0,5000),actions:arr(parsed.actions),clarifications:arr(parsed.clarifications),references,caution:String(parsed.caution||'').slice(0,1500)});
 }catch(e){return reply(502,{error:e.name==='TimeoutError'?'Время ожидания Gemini истекло':'Не удалось получить корректный ответ Gemini'});}
};
