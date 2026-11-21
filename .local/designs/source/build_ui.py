from pathlib import Path
from html import escape
ROOT=Path('/mnt/data/NPV_Analytics_UI_Kit')
S=ROOT/'source'
nav_items=[('overview','Обзор','◫'),('generator-simple','Генератор сделок','◈'),('portfolio','Портфель','▤'),('factor-scenario','Факторный анализ','▥'),('curves','Кривые ставок','⌁'),('integrations-connections','Данные и интеграции','⛓')]

def badge(s, tone='blue'):return f'<span class="badge {tone}">{s}</span>'
def card(contents,cls='',title=''):return f'<div class="card {cls}">{f"<div class=\'card-title\'>{title}</div>" if title else ""}{contents}</div>'
def kpi(title,val,sub='',tone='blue',icon='↗'):return f'<div class="kpi {tone}"><div class="kpi-line"><span>{title}</span><span class="kpi-icon">{icon}</span></div><div class="kpi-value">{val}</div><div class="kpi-sub">{sub}</div></div>'
def field(label,value,help='',sel=False):return f'<div class="field"><label>{label}</label><div class="form-input">{value}{" <span class=\'caret\'>⌄</span>" if sel else ""}</div>{f"<div class=\'help\'>{help}</div>" if help else ""}</div>'
def filterbtn(s):return f'<span class="filter-chip">{s} <span class="muted">⌄</span></span>'
def sectiontitle(t,rt=''):return f'<div class="section-header"><h3>{t}</h3><div class="section-side">{rt}</div></div>'
def topheading(title,desc,actions=''):return f'<div class="page-heading"><div><div class="crumb">NPV ANALYTICS <span> / </span> {title.upper()}</div><h1>{title}</h1><p>{desc}</p></div><div class="page-actions">{actions}</div></div>'
def btn(text,primary=False,icon=''):return f'<span class="btn {"primary" if primary else ""}">{icon+" " if icon else ""}{text}</span>'
def tabs(labels,active):return '<div class="tabs">'+''.join(f'<div class="tab {"active" if i==active else ""}">{e}</div>' for i,e in enumerate(labels))+'</div>'
def line_chart(labels=None,data=None,secondary=None,unit='млн ₽',height=280):
    labels=labels or ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК']
    data=data or [42,45,43,49,51,52,50,58,56,59,61,65]
    mn=min(data+(secondary or []));mx=max(data+(secondary or [])); pad=(mx-mn)*.28 or 1;mn-=pad;mx+=pad
    plotw=890;ploth=height-55
    def points(vals):return ' '.join(f'{45+i*(plotw-50)/(len(vals)-1):.0f},{20+(mx-y)/(mx-mn)*(ploth-30):.1f}' for i,y in enumerate(vals))
    pts=points(data);path=' '.join(pts.split(' '))
    grid=''.join(f'<line x1="40" x2="{plotw}" y1="{20+j*(ploth-30)/4}" y2="{20+j*(ploth-30)/4}" stroke="#29425f" stroke-width="1" opacity=".6"/>' for j in range(5))
    labels_svg=''.join(f'<text x="{45+i*(plotw-50)/(len(labels)-1):.0f}" y="{height-7}" text-anchor="middle" font-size="11" fill="#7e92ad">{escape(label)}</text>' for i,label in enumerate(labels))
    other=f'<polyline points="{points(secondary)}" stroke="#a88eff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' if secondary else ''
    return f'<svg class="line-chart" viewBox="0 0 900 {height}" preserveAspectRatio="none"><defs><linearGradient id="fill_{height}_{len(data)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6" stop-opacity=".32"/><stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>{grid}<polygon points="45,{ploth} {pts} {plotw-5},{ploth}" fill="url(#fill_{height}_{len(data)})"/><polyline points="{pts}" stroke="#55bdfa" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>{other}{labels_svg}</svg>'
def donut(parts,center='10 000',caption='сделок'):
    gradients='conic-gradient(#348afa 0 70%, #a98afa 70% 94%, #2dd4bf 94% 100%)'
    return f'<div class="donut" style="background:{gradients}"><div class="donut-hole"><strong>{center}</strong><span>{caption}</span></div></div>'
def table(headers,rows,cls=''):
    h='<table class="data-table '+cls+'"><thead><tr>'+''.join(f'<th>{x}</th>' for x in headers)+'</tr></thead><tbody>'
    for r in rows:
        h+='<tr>'+''.join(f'<td>{x}</td>' for x in r)+'</tr>'
    return h+'</tbody></table>'
def bars(stats):return '<div class="bar-list">'+''.join(f'<div class="bar-item"><div class="bar-top"><span>{nm}</span><b>{v}%</b></div><div class="bar-track"><div class="bar-fill {tone}" style="width:{v}%"></div></div></div>' for nm,v,tone in stats)+'</div>'

def overview():
    a=topheading('Обзор портфеля','Финансовые показатели, динамика NPV и состояние аналитической платформы',btn('Создать портфель',True,'＋'))
    a+='<div class="kpi-grid">'+kpi('NPV портфеля','+24,8 млн ₽','▲ 2,4% к предыдущему расчёту','green','◉')+kpi('Количество сделок','10 000','7 500 кредитов · 2 500 депозитов','blue','▣')+kpi('Объём кредитов','8,42 млрд ₽','Обязательства по депозитам: 3,16 млрд ₽','blue','▤')+kpi('Средневзвешенная ставка','15,7%','По кредитам · 11,2% по депозитам','violet','%')+'</div>'
    left=sectiontitle('Динамика NPV','<span class="mini-select">6 месяцев ⌄</span>')+line_chart()+ '<div class="legend"><i class="dot blue"></i> NPV портфеля <span class="muted">· Демо-ряд для макета</span></div>'
    right=sectiontitle('Структура портфеля','По количеству сделок')+f'<div class="donut-wrapper">{donut(None)}<div class="legend-col"><div><i class="dot blue"></i> Кредиты <strong>75%</strong></div><div><i class="dot purple"></i> Депозиты <strong>25%</strong></div></div></div>'+sectiontitle('Тип процентной ставки')+bars([('Фиксированная',70,'blue'),('Плавающая',30,'purple')])
    a+=f'<div class="grid  main-grid"><div class="card chart-large">{left}</div><div class="card">{right}</div></div>'
    analysis=sectiontitle('Последний факторный анализ',badge('Пример результата','slate'))+'<div class="analysis-kpi"><div><span>NPV до</span><strong>24,8 млн ₽</strong></div><div class="arrow">→</div><div><span>NPV после</span><strong>22,6 млн ₽</strong></div><div class="delta negative">−2,2 млн ₽</div></div><div class="muted tiny">Сценарий: увеличение ставки дисконтирования на 100 б.п. · иллюстрация</div>'
    status=sectiontitle('Возможности платформы')+''.join('<div class="status-row"><span>'+n+'</span>'+badge(st,t)+'</div>' for n,st,t in [('Генератор сделок','Реализуется','blue'),('Расчёт денежных потоков','Проверяется','slate'),('Исторический факторный анализ','Ожидает данных','purple')])
    a+=f'<div class="grid half-grid"><div class="card">{analysis}</div><div class="card">{status}</div></div>'
    return a

def generator_simple():
    a=topheading('Генератор сделок','Сформируйте синтетический портфель с контролируемой структурой',btn('История генераций'))
    a+=tabs(['Простой режим','Расширенный режим'],0)
    left=sectiontitle('Основные параметры')+'<div class="form-grid">'+field('Название портфеля','Синтетический портфель — ноябрь')+field('Количество сделок','10 000')+field('Тип портфеля','Смешанный · кредиты и депозиты',sel=True)+field('Дата оценки','21.11.2026')+field('Шаблон генерации','Сбалансированный',sel=True)+field('Seed генератора','42')+'</div>'
    left+='<div class="divider"></div>'+sectiontitle('Соотношение инструментов')+'<div class="range-row"><span>Кредиты</span><strong>70%</strong><div class="range"><i style="width:70%"></i></div><span>Депозиты</span><strong>30%</strong></div>'
    left+='<div class="footer-actions">'+btn('Проверить настройки')+btn('Сгенерировать портфель',True,'✦')+'</div>'
    right=sectiontitle('Предварительная структура',badge('По настройкам','blue'))+'<div class="stat-3"><div><span>Сделок</span><b>10 000</b></div><div><span>Кредиты</span><b>7 000</b></div><div><span>Депозиты</span><b>3 000</b></div></div>'+sectiontitle('Типы графиков платежей')+bars([('Аннуитетный (ANN)',50,'blue'),('Равные доли (RGM)',30,'purple'),('SIMPLE',20,'mint')])+sectiontitle('Тип процентной ставки')+bars([('FIXED',70,'blue'),('FLOAT',30,'mint')])+'<div class="note"><b>Простой режим</b><p>Остальные параметры возьмём из выбранного шаблона. Для точной настройки распределений переключитесь в расширенный режим.</p></div>'
    a+=f'<div class="grid generator-grid"><div class="card">{left}</div><div class="card">{right}</div></div>'
    return a

def generator_advanced():
    a=topheading('Генератор сделок','Детальная настройка распределений и условий кредитных и депозитных сделок',btn('Сохранить шаблон')+btn('Сгенерировать',True,'✦'))
    a+=tabs(['Простой режим','Расширенный режим'],1)
    a+='<div class="subnav">'+''.join(f'<span class="{ "on" if i==0 else ""}">{n}</span>' for i,n in enumerate(['Суммы и сроки','Графики платежей','Ставки','Досрочки','Субсидии','Экспертные']))+'</div>'
    l=sectiontitle('Распределение сумм',badge('По интервалам','blue'))+'<div class="form-grid">'+field('Минимальная сумма','100 000 ₽')+field('Максимальная сумма','5 000 000 ₽')+field('Модель распределения','По интервалам',sel=True)+field('Seed','42')+'</div>'
    l+=sectiontitle('Доли по суммам')+''.join(f'<div class="input-line"><span>{n}</span><span class="small-input">{v}%</span></div>' for n,v in [('100 000–500 000 ₽',55),('500 000–2 000 000 ₽',30),('2 000 000–5 000 000 ₽',15)])+'<div class="success-line">✓ Сумма долей: 100%</div>'
    l+='<div class="divider"></div>'+sectiontitle('Распределение сроков')+''.join(f'<div class="input-line"><span>{n}</span><span class="small-input">{v}%</span></div>' for n,v in [('До 12 месяцев',20),('13–36 месяцев',45),('37–60 месяцев',25),('61–120 месяцев',10)])+'<div class="success-line">✓ Сумма долей: 100%</div>'
    r=sectiontitle('Предпросмотр распределения сумм','Гистограмма · пример')+'<div class="histogram">'+''.join(f'<div style="height:{h}%" class="hist-bar"></div>' for h in [15,35,74,95,83,64,48,33,23,15,8,5])+'</div><div class="axis"><span>100 тыс.</span><span>5 млн ₽</span></div>'
    r+=sectiontitle('Сроки кредитования','По интервалам')+bars([('≤12 мес.',20,'blue'),('13–36 мес.',45,'blue'),('37–60 мес.',25,'purple'),('61–120 мес.',10,'mint')])
    r+='<div class="note"><b>Проверка распределений</b><p>Проверяем сумму категориальных долей, допустимые диапазоны и совместимость полей с форматом расчётного движка.</p></div>'
    a+=f'<div class="grid generator-grid"><div class="card">{l}</div><div class="card">{r}</div></div>'
    return a

def portfolio():
    a=topheading('Портфель','Реестр кредитных и депозитных сделок, расчёты и финансовые показатели',btn('Экспорт CSV')+btn('Рассчитать портфель',True,'▶'))
    a+='<div class="select-strip"><div class="select-box">Текущий портфель <strong>Синтетический портфель — ноябрь ⌄</strong></div><div class="select-box">Дата оценки <strong>21.11.2026</strong></div>'+badge('Ожидает расчёта','slate')+'</div>'
    a+='<div class="kpi-grid">'+kpi('Всего сделок','10 000','Кредиты: 7 000 · депозиты: 3 000','blue','▣')+kpi('Кредитные остатки','8,42 млрд ₽','Активы банка','blue','▤')+kpi('Депозитные остатки','3,16 млрд ₽','Обязательства банка','violet','◫')+kpi('NPV портфеля','—','Рассчитайте денежные потоки и DF','green','↗')+'</div>'
    a+=tabs(['Сделки','Денежные потоки','Структура','История расчётов'],0)
    a+=card(sectiontitle('Реестр сделок','10 000 записей')+'<div class="filters"><span class="search">⌕ &nbsp; Поиск по ID или продукту</span>'+filterbtn('Тип сделки')+filterbtn('Ставка')+filterbtn('График')+filterbtn('Статус')+'</div>'+table(['ID сделки','Тип','Остаток','Срок','Ставка','График','Расчёт','NPV',''],[[f'<b class="link">{d}</b>',badge('Кредит','blue') if i%3!=1 else badge('Депозит','purple'),f'{v} ₽',f'{12+i*6} мес.','16,5%' if i%2 else 'КС + 3 п.п.','ANN' if i%3==0 else 'RGM' if i%3==2 else 'SIMPLE',badge('Ожидает','slate'),'—','↗'] for i,(d,v) in enumerate([('CR-000125','1 250 000'),('DP-000126','800 000'),('CR-000127','2 400 000'),('CR-000128','540 000'),('DP-000129','920 000'),('CR-000130','3 150 000'),('CR-000131','415 000'),('DP-000132','1 500 000')])])+'<div class="pagination"><span>Показано 8 из 10 000</span><span>‹ &nbsp; <b>1</b> &nbsp; 2 &nbsp; 3 &nbsp; … &nbsp; 1250 &nbsp; ›</span></div>')
    return a

def deal_detail():
    a=topheading('Сделка CR-000125','Портфель / Синтетический портфель — ноябрь / CR-000125',btn('← К портфелю')+btn('Факторный анализ',True))
    a+='<div class="meta-strip">'+badge('Кредит','blue')+badge('Аннуитет','slate')+badge('FIXED','slate')+badge('Пример данных','purple')+'</div>'
    a+='<div class="kpi-grid">'+kpi('Текущий остаток','1 250 000 ₽','Номинальная сумма','blue','₽')+kpi('Ставка','16,5%','Фиксированная','blue','%')+kpi('До погашения','36 мес.','Дата 21.11.2029','violet','◷')+kpi('NPV сделки','—','После дисконтирования','green','↗')+'</div>'
    a+=tabs(['Общие сведения','График платежей','NPV и дисконтирование','Исходные данные','Диагностика'],1)
    l=sectiontitle('Динамика платежей','Проценты · тело кредита')+line_chart(['ДЕК','ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ'],[44,41,40,36,34,31,28,24,20,18,14,10],secondary=[15,19,23,28,32,35,39,43,48,52,55,60],height=255)+'<div class="legend"><i class="dot blue"></i> Проценты &nbsp;&nbsp; <i class="dot purple"></i> Погашение тела <span class="muted">(пример)</span></div>'
    r=sectiontitle('Параметры сделки')+''.join(f'<div class="kv"><span>{n}</span><b>{v}</b></div>' for n,v in [('ID сделки','CR-000125'),('Дата выдачи','21.11.2026'),('Дата погашения','21.11.2029'),('Тип платежей','ANN'),('Периодичность','1M'),('Конвенция','ACT/365'),('Досрочные погашения','Нет'),('Субсидирование','Нет')])
    a+=f'<div class="grid main-grid"><div class="card">{l}</div><div class="card">{r}</div></div>'
    a+=card(sectiontitle('График платежей','Экспорт таблицы ↓')+table(['Дата платежа','Тело','Проценты','Общий поток','Остаток после'],[['21.12.2026','29 840 ₽','17 190 ₽','47 030 ₽','1 220 160 ₽'],['21.01.2027','30 260 ₽','16 770 ₽','47 030 ₽','1 189 900 ₽'],['21.02.2027','30 660 ₽','16 370 ₽','47 030 ₽','1 159 240 ₽'],['21.03.2027','31 050 ₽','15 980 ₽','47 030 ₽','1 128 190 ₽']])+'<div class="muted tiny">Числа — иллюстрация в дизайн-макете. На рабочем сайте данные берутся из расчётного движка.</div>')
    return a

def waterfall():
    # fixed full waterfall schematic
    vals=[24.8,2.3,-1.1,-0.9,-0.5,24.6]
    labels=['NPV до','Ставка','Ключевая','DF','Досрочки','NPV после']
    x=55; w=680;step=110;bottom=210;scale=5
    elems=''
    running=24.8
    for i,v in enumerate(vals):
        xx=x+i*step
        if i==0 or i==5:
            yy=bottom-v*scale;h=v*scale;color='#438fff'
        else:
            new=running+v;yy=bottom-max(running,new)*scale;h=abs(v)*scale;color='#2dd4bf' if v>=0 else '#ff7692';running=new
        elems+=f'<rect x="{xx}" y="{yy:.1f}" width="65" height="{max(4,h):.1f}" rx="5" fill="{color}"/><text x="{xx+33}" y="{yy-8:.1f}" fill="#d9e9ff" font-size="11" text-anchor="middle">{("+" if v>0 and i not in (0,5) else "")}{v:g}</text><text x="{xx+33}" y="238" fill="#8399b4" font-size="10" text-anchor="middle">{labels[i]}</text>'
    return f'<svg class="waterfall" viewBox="0 0 755 253"><line x1="25" y1="210" x2="735" y2="210" stroke="#2b4360"/>{elems}</svg>'

def factor_scenario():
    a=topheading('Факторный анализ NPV','Моделирование изменений и объяснение влияния факторов на стоимость портфеля',btn('История сценариев')+btn('Рассчитать',True,'▶'))
    a+=tabs(['Сценарный анализ','Изменение между датами'],0)
    left=sectiontitle('Настройки сценария',badge('Что, если?','blue'))+field('Объект анализа','Синтетический портфель — ноябрь',sel=True)+field('Базовый расчёт','Снимок 21.11.2026',sel=True)
    left+='<div class="divider"></div>'+sectiontitle('Изменяемые факторы')
    left+='<div class="factor-control"><div class="factor-h"><span>Процентная ставка кредита</span><span class="pill">+2,0 п.п.</span></div><div class="faux-slider"><span style="left:65%"></span></div><div class="range-label"><span>−5 п.п.</span><span>+5 п.п.</span></div></div>'
    left+='<div class="factor-control"><div class="factor-h"><span>Сдвиг дисконтной кривой</span><span class="pill">+100 б.п.</span></div><div class="faux-slider"><span style="left:60%"></span></div><div class="range-label"><span>−500 б.п.</span><span>+500 б.п.</span></div></div>'
    left+=btn('＋ Добавить фактор')+'<div class="note"><b>Метод факторного разложения</b><p>Последовательная подстановка. Сумма вкладов равна итоговой ΔNPV.</p></div>'
    right=sectiontitle('Результаты сценария',badge('Пример','slate'))+'<div class="stat-3"><div><span>NPV до</span><b>24,8 млн ₽</b></div><div><span>NPV после</span><b>24,6 млн ₽</b></div><div><span>ΔNPV</span><b class="neg">−0,2 млн ₽</b></div></div>'+sectiontitle('Разложение изменения NPV','Млн ₽')+waterfall()+'<div class="muted tiny">Иллюстративные значения для демонстрации расположения waterfall.</div>'
    a+=f'<div class="grid factor-grid"><div class="card">{left}</div><div class="card">{right}</div></div>'
    a+=card(sectiontitle('Детализация факторов','Все суммы в ₽')+table(['Фактор','Изменение','NPV после шага','Вклад в ΔNPV','Метод'],[['Договорная ставка','+2,0 п.п.','27 100 000','+2 300 000','Пересчёт потоков'],['Ключевая ставка','−50 б.п.','26 000 000','−1 100 000','FLOAT'],['Кривая дисконтирования','+100 б.п.','25 100 000','−900 000','Пересчёт DF'],['Досрочные погашения','+10%','24 600 000','−500 000','Новые потоки']]))
    return a

def factor_history():
    a=topheading('Факторный анализ NPV','Сравнение экономической стоимости портфеля между двумя датами',btn('Проверить доступность снимков',True))
    a+=tabs(['Сценарный анализ','Изменение между датами'],1)
    a+=card(sectiontitle('Параметры исторического анализа')+'<div class="form-grid four">'+field('Портфель','Синтетический портфель',sel=True)+field('Первая дата','30.06.2026')+field('Вторая дата','31.07.2026')+field('Метод сравнения','Последовательное разложение',sel=True)+'</div>')
    a+='<div class="callout"><span class="alert-icon">ⓘ</span><div><strong>Для анализа требуются два полных исторических снимка</strong><p>Необходимы состояния сделок, остатки, денежные потоки и кривые на обе даты. Пока такие данные не загружены, расчёт не выполняется и значения NPV не подставляются.</p></div>'+badge('Ожидает данных','purple')+'</div>'
    a+='<div class="grid half-grid"><div class="card">'+sectiontitle('Сравнение NPV')+'<div class="empty-chart"><span>▥</span><b>Нет сопоставимых расчётов</b><p>Загрузите снимки на обе даты</p></div></div><div class="card">'+sectiontitle('Факторы изменения')+'<div class="empty-chart"><span>◫</span><b>Вклад факторов пока недоступен</b><p>Появится после расчёта обеих дат</p></div></div></div>'
    a+=card(sectiontitle('Необходимые данные')+table(['Источник','30.06.2026','31.07.2026','Действие'],[['Снимок портфеля',badge('Нет данных','purple'),badge('Нет данных','purple'),'Загрузить'],['Кривая дисконтирования',badge('Нет данных','purple'),badge('Нет данных','purple'),'Открыть источники'],['Денежные потоки',badge('Нет расчёта','slate'),badge('Нет расчёта','slate'),'Подготовить']]))
    return a

def curves():
    a=topheading('Кривые ставок','Базовые и сценарные процентные кривые, сравнение по срокам',btn('Получить последнюю кривую',True,'↻'))
    a+=tabs(['Кривые','Сценарии','Дисконтирование и NPV','История кривых'],0)
    a+='<div class="select-strip"><div class="select-box">Источник <strong>QuantumTeam / MOEX ⌄</strong></div><div class="select-box">Снимок <strong>Доступный снимок ⌄</strong></div><div class="select-box">Сценарий <strong>Parallel up ⌄</strong></div>'+badge('Демо-кривые','slate')+'</div>'
    a+='<div class="kpi-grid">'+kpi('Ставка 3 месяца','14,50%','Базовая кривая','blue','↗')+kpi('Ставка 1 год','13,50%','Базовая кривая','blue','↗')+kpi('Ставка 5 лет','12,20%','Базовая кривая','violet','↗')+kpi('Параллельный сдвиг','+100 б.п.','+1,0 процентный пункт','green','↗')+'</div>'
    labels=['3М','6М','1Г','2Г','3Г','5Л','7Л','10Л','15Л','20Л','30Л']
    data=[14.5,14.0,13.5,13.1,12.7,12.2,12.05,11.8,11.5,11.35,11.2]
    left=sectiontitle('Сравнение кривых','<span class="legend"><i class="dot blue"></i> Базовая &nbsp; <i class="dot purple"></i> Сценарная</span>')+line_chart(labels,data,[x+1 for x in data],height=350)
    right=sectiontitle('Быстрое сравнение')+bars([('Short up',72,'blue'),('Parallel up',100,'purple'),('Steepener',49,'mint')])+'<div class="divider"></div>'+sectiontitle('Кривая как источник')+'<div class="kv"><span>Источник</span><b>QuantumTeam</b></div><div class="kv"><span>Состояние подключения</span><b>Не проверено</b></div><div class="kv"><span>Конвенция ставки</span><b>Уточняется</b></div><div class="note"><b>Важное ограничение</b><p>Кривая дисконтирования и прогноз ключевой ставки для FLOAT — разные сущности.</p></div>'
    a+=f'<div class="grid main-grid"><div class="card">{left}</div><div class="card">{right}</div></div>'
    a+=card(sectiontitle('Точки кривой')+table(['Срок','Базовая ставка','Сценарная ставка','Сдвиг','Статус'],[[labels[i],f'{data[i]:.2f}%'.replace('.',','),f'{data[i]+1:.2f}%'.replace('.',','),'+100 б.п.',badge('Пример','slate')] for i in range(7)]))
    return a

def curves_scenarios():
    a=topheading('Кривые ставок','Управление базовыми и пользовательскими стресс-сценариями',btn('Создать сценарий',True,'＋'))
    a+=tabs(['Кривые','Сценарии','Дисконтирование и NPV','История кривых'],1)
    l=sectiontitle('Стандартные сценарии')+'<div class="scenario-list">'+''.join(f'<div class="scenario-item {"selected" if i==0 else ""}"><span class="scenario-icon">{sym}</span><div><strong>{n}</strong><small>{desc}</small></div><span class="chevron">›</span></div>' for i,(n,desc,sym) in enumerate([('Parallel up','Параллельный рост ставок','↗'),('Parallel down','Параллельное снижение ставок','↘'),('Short up','Рост краткосрочных ставок','↗'),('Short down','Снижение краткосрочных ставок','↘'),('Steepener','Увеличение наклона кривой','⌁'),('Flattener','Уменьшение наклона кривой','⌁')]))+'</div>'
    r=sectiontitle('Пользовательский сценарий',badge('Редактор','blue'))+field('Название сценария','Повышение краткосрочных ставок')+field('Тип сдвига','По контрольным срокам',sel=True)+sectiontitle('Точки сдвига')+table(['Срок','Сдвиг, б.п.'],[['3 месяца','+150'],['1 год','+125'],['3 года','+75'],['5 лет','+50'],['10 лет','+25']])+'<div class="footer-actions">'+btn('Проверить')+btn('Сохранить сценарий',True)+'</div>'+'<div class="note"><b>При сохранении</b><p>Базовый снимок не меняется: создаётся отдельная версия сценария.</p></div>'
    a+=f'<div class="grid half-grid"><div class="card">{l}</div><div class="card">{r}</div></div>'
    return a

def curves_discount():
    a=topheading('Кривые ставок','Влияние базовой и сценарной дисконтных кривых на PV и NPV',btn('Рассчитать влияние',True,'▶'))
    a+=tabs(['Кривые','Сценарии','Дисконтирование и NPV','История кривых'],2)
    a+=card(sectiontitle('Параметры дисконтирования')+'<div class="form-grid four">'+field('Объект','Синтетический портфель',sel=True)+field('Кривая до','Базовая',sel=True)+field('Кривая после','Parallel up',sel=True)+field('Дата оценки','21.11.2026')+'</div>')
    a+='<div class="kpi-grid">'+kpi('NPV до','—','Нет расчёта','blue','₽')+kpi('NPV после','—','Нет расчёта','blue','₽')+kpi('ΔNPV','—','После применения кривой','green','↗')+kpi('Точек в кривой','19','Временные корзины','violet','⋯')+'</div>'
    a+=card(sectiontitle('Дисконт-факторы и приведённая стоимость','После расчёта')+table(['Срок t, лет','r до','r после','DF до','DF после','PV до, ₽','PV после, ₽','ΔPV, ₽'],[['0,25','14,50%','15,50%','—','—','—','—','—'],['0,50','14,00%','15,00%','—','—','—','—','—'],['1,00','13,50%','14,50%','—','—','—','—','—'],['2,00','13,10%','14,10%','—','—','—','—','—'],['3,00','12,70%','13,70%','—','—','—','—','—']])+'<div class="note"><b>Ожидает методику</b><p>DF и PV появятся после выбора подтверждённой конвенции кривой и получения денежных потоков. Макет не выдаёт примерные значения за расчёт.</p></div>')
    return a

def curves_history():
    a=topheading('Кривые ставок','Сравнение рыночных кривых за разные даты',btn('Загрузить снимок',True))
    a+=tabs(['Кривые','Сценарии','Дисконтирование и NPV','История кривых'],3)
    a+=card(sectiontitle('Историческое сравнение')+'<div class="form-grid">'+field('Начальная дата','30.06.2026')+field('Конечная дата','31.07.2026')+'</div>')
    a+='<div class="callout"><span class="alert-icon">ⓘ</span><div><strong>Нужны исторические снимки QuantumTeam</strong><p>После появления доступных снимков система покажет две кривые и отклонения по срокам. Пока не изображаем отсутствующие исторические данные.</p></div>'+badge('Ожидает данных','purple')+'</div>'
    a+='<div class="grid half-grid"><div class="card">'+sectiontitle('Кривые на две даты')+'<div class="empty-chart big"><span>⌁</span><b>История ставок пока недоступна</b><p>Добавьте исторические снимки через раздел «Источники данных»</p></div></div><div class="card">'+sectiontitle('Изменения по срокам')+'<div class="empty-chart big"><span>▤</span><b>Нет сопоставимых точек</b><p>Результаты сравнения появятся здесь</p></div></div></div>'
    return a

def integ_header(tab):return topheading('Данные и интеграции','Подключения, загрузка данных, запуски вычислений и диагностика',btn('Проверить подключения',True,'↻'))+tabs(['Подключения','Источники данных','Запуски расчётов','Проверки и журнал'],tab)

def integ_connections():
    a=integ_header(0)
    a+='<div class="kpi-grid">'+kpi('Интеграции','2','Запланированы к подключению','blue','⛓')+kpi('Проверено','0 из 2','Статусы не проверены','violet','✓')+kpi('Запуски расчётов','0','В текущем окружении','blue','▶')+kpi('Ошибки','—','Проверка не запускалась','green','!')+'</div>'
    cards=[]
    for name,tech,method,desc in [('nosnitches-cashflow','Rust · cfgen','CLI / локальный бинарник','Денежные потоки, графики платежей, диагностика'),('QuantumTeam','Python · FastAPI','HTTP / REST','Базовые и сценарные процентные кривые')]:
        cr=sectiontitle(name,badge('Не проверено','slate'))+'<div class="service-sub">'+desc+'</div>'+'<div class="divider"></div>'+''.join(f'<div class="kv"><span>{n}</span><b>{v}</b></div>' for n,v in [('Технология',tech),('Способ подключения',method),('Доступность','Не проверено'),('Версия','—'),('Последняя проверка','—')])+'<div class="footer-actions">'+btn('Проверить')+btn('Подробнее →')+'</div>'
        cards.append(card(cr))
    a+='<div class="grid half-grid">'+''.join(cards)+'</div>'
    a+=card(sectiontitle('Цепочка обработки данных')+'<div class="pipeline"><div>Генератор<br/><small>Наш модуль</small></div><span>→</span><div>Денежные потоки<br/><small>nosnitches</small></div><span>→</span><div>Кривые ставок<br/><small>QuantumTeam</small></div><span>→</span><div>NPV + факторы<br/><small>Наш backend</small></div></div>')
    return a

def integ_sources():
    a=integ_header(1)
    a+='<div class="grid half-grid"><div class="card">'+sectiontitle('Импорт данных')+'<div class="upload"><span>⇧</span><strong>Перетащите CSV-файл сюда</strong><p>Или выберите его для проверки и импорта</p><span class="btn">Выбрать файл</span></div><div class="help">Форматы: сделки, ключевая ставка, кривые, рассчитанные потоки.</div></div><div class="card">'+sectiontitle('Проверка загружаемых файлов')+''.join(f'<div class="check-row"><span class="check-symbol">✓</span><div><b>{t}</b><p>{desc}</p></div></div>' for t,desc in [('Структура CSV','Заголовки, обязательные столбцы и кодировка'),('Финансовая валидация','Даты, суммы, знаки и типы ставок'),('Контроль повторов','Уникальные идентификаторы сделок')])+'</div></div>'
    a+=card(sectiontitle('Каталог наборов данных','Последние загрузки')+table(['Категория','Источник','Версия','Количество','Состояние'],[['Сделки','Генератор','v1','10 000',badge('Пример','slate')],['Ключевая ставка','CSV','—','—',badge('Не загружено','slate')],['Кривая дисконтирования','QuantumTeam','—','—',badge('Нет снимка','purple')],['Денежные потоки','nosnitches','—','—',badge('Нет расчёта','slate')]]))
    return a

def integ_runs():
    a=integ_header(2)
    a+='<div class="kpi-grid">'+kpi('Всего запусков','0','В текущем окружении','blue','▶')+kpi('В очереди','0','Нет активных заданий','violet','◷')+kpi('Завершено','0','Пока нет вычислений','green','✓')+kpi('Ошибки','0','Нет зарегистрированных запусков','blue','!')+'</div>'
    a+=card(sectiontitle('Этапы сквозного расчёта')+'<div class="pipeline"><div>① Валидация</div><span>→</span><div>② Потоки</div><span>→</span><div>③ Кривые</div><span>→</span><div>④ NPV</div><span>→</span><div>⑤ Факторы</div></div><div class="help">Реальный процент выполнения появится только при наличии достоверной информации о прогрессе.</div>')
    a+=card(sectiontitle('История вычислений')+'<div class="empty-chart big"><span>▣</span><b>Расчёты ещё не запускались</b><p>После запуска генерации, денежных потоков или NPV здесь появится история заданий</p></div>')
    return a

def integ_logs():
    a=integ_header(3)
    a+=card(sectiontitle('Проверки и диагностика','Статус: не проверено')+'<div class="grid three-grid">'+''.join(f'<div class="diag"><div class="diag-icon">{i}</div><strong>{n}</strong><p>{desc}</p>'+btn('Проверить')+'</div>' for i,n,desc in [('▤','Формат сделок','Проверка входного CSV'),('⌁','Кривые ставок','Проверка API и точек'),('↗','Сквозной тест','Потоки → DF → NPV')])+'</div>')
    a+=card(sectiontitle('Журнал событий')+'<div class="filters">'+filterbtn('Все источники')+filterbtn('Все уровни')+'<span class="search">⌕ &nbsp; Поиск по коду, сообщению или ID</span></div>'+table(['Время','Модуль','Уровень','Код','Описание'],[['—','Система',badge('Информация','slate'),'—','События пока отсутствуют']])+'<div class="note"><b>Диагностика расчётного движка</b><p>Поля исходных ошибок: deal_id, severity, code, field, message. Не удаляем и не скрываем ошибки при импорте.</p></div>')
    return a

screens={
'01_overview':'overview',
'02_generator_simple':'generator-simple',
'03_generator_advanced':'generator-advanced',
'04_portfolio':'portfolio',
'05_deal_detail':'deal-detail',
'06_factor_scenario':'factor-scenario',
'07_factor_history':'factor-history',
'08_curves':'curves',
'09_curves_scenarios':'curves-scenarios',
'10_curves_discount':'curves-discount',
'11_curves_history':'curves-history',
'12_integrations_connections':'integrations-connections',
'13_integrations_sources':'integrations-sources',
'14_integrations_runs':'integrations-runs',
'15_integrations_logs':'integrations-logs'
}
fnmap={'overview':overview,'generator-simple':generator_simple,'generator-advanced':generator_advanced,'portfolio':portfolio,'deal-detail':deal_detail,'factor-scenario':factor_scenario,'factor-history':factor_history,'curves':curves,'curves-scenarios':curves_scenarios,'curves-discount':curves_discount,'curves-history':curves_history,'integrations-connections':integ_connections,'integrations-sources':integ_sources,'integrations-runs':integ_runs,'integrations-logs':integ_logs}
sidebar='''<aside class="sidebar"><div class="brand"><div class="brand-mark">⌁</div><span>NPV <b>Analytics</b></span></div><div class="side-label">РАБОЧАЯ ОБЛАСТЬ</div>'''
for route,label,ic in nav_items:sidebar+=f'<a class="nav-item" data-route="{route}" href="?screen={route}"><span class="nav-icon">{ic}</span><span>{label}</span></a>'
sidebar+='''<div class="side-spacer"></div><div class="sidebar-panel"><div class="sp-dot"></div><div><strong>Проект · Спринт 03</strong><span>Команда «пацаны»</span></div></div><div class="sidebar-foot"><span>⚙</span><span>Настройки отображения</span></div></aside>'''
layout='''<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>NPV Analytics · UI Reference</title><link rel="stylesheet" href="styles.css"/></head><body>
<div class="app">'''+sidebar+'''<div class="workspace"><header class="topbar"><div class="topbar-left"><span class="top-brand">РАБОЧЕЕ ПРОСТРАНСТВО</span><span class="top-divider"></span><span>Портфель: </span><span class="top-portfolio">Синтетический портфель — ноябрь <span>⌄</span></span></div><div class="topbar-right"><span class="top-status"><i class="topstatus-dot"></i> nosnitches <span>не проверено</span></span><span class="top-status"><i class="topstatus-dot"></i> QuantumTeam <span>не проверено</span></span><span class="mock-badge">ДИЗАЙН-МАКЕТ</span><span class="avatar">П</span></div></header><main class="main" id="main"></main><footer class="footline">NPV ANALYTICS <span>·</span> СПРИНТ 03 <span>·</span> Дизайн-референс · Значения в макетах иллюстративные</footer></div></div>
<script src="pages.js"></script></body></html>'''
(S/'index.html').write_text(layout,encoding='utf-8')
js='const SCREEN_CONTENT = '+__import__('json').dumps({k:v() for k,v in fnmap.items()},ensure_ascii=False)+';\nconst route=(new URLSearchParams(location.search).get("screen")||"overview");document.querySelector("#main").innerHTML=SCREEN_CONTENT[route]||SCREEN_CONTENT.overview;document.querySelectorAll(".nav-item").forEach(el=>{if(el.dataset.route===route || (route.startsWith("generator") && el.dataset.route==="generator-simple")||(route.startsWith("factor")&&el.dataset.route==="factor-scenario")||(route.startsWith("curves")&&el.dataset.route==="curves")||(route.startsWith("integrations")&&el.dataset.route==="integrations-connections")||(route==="deal-detail"&&el.dataset.route==="portfolio"))el.classList.add("active")});\n'
(S/'pages.js').write_text(js,encoding='utf-8')
(S/'screens.json').write_text(__import__('json').dumps(screens,ensure_ascii=False,indent=2),encoding='utf-8')
print('HTML generated',len(js),'js chars')
