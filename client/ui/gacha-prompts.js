// English draw prompts. This is separate from the fixed, calibrated personal-library protocol.
const GachaPrompts = (() => {
  const PROTOCOL = 'modeltrace-dynamic-en-v1';
  const DEFAULT_PREFERRED = Object.freeze(['6-astra', 'opus-5.5', 'fable']);
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const keywords = value => [...new Map((Array.isArray(value) ? value : String(value || '').split(/[,，;；\n]+/)).map(x => String(x).trim()).filter(x => normalize(x)).map(x => [normalize(x), x])).values()].slice(0, 60);
  const match = (name, list) => keywords(list).find(k => normalize(name).includes(normalize(k))) || '';
  function randomInt(n) {
    const a = new Uint32Array(1), limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % n;
  }
  const pick = list => list[randomInt(list.length)];
  const remember = (key, prompt) => { const rows = Store.get(key, []); Store.set(key, [...(Array.isArray(rows) ? rows : []), prompt].slice(-240)); };
  function unique(key, make) {
    const history = new Set(Store.get(key, []) || []);
    for (let i = 0; i < 500; i++) { const value = make(); if (!history.has(value)) { remember(key, value); return value; } }
    throw Error('提示词随机组合暂时耗尽，请稍后重试');
  }
  function challenges() {
    const lengths = new Set(), result = [];
    for (let i = 0; i < 3; i++) {
      let length; do { length = 292 + randomInt(41); } while (lengths.has(length)); lengths.add(length);
      const prompt = unique('gacha:probe-prompts:v1', () => {
        const opening = pick(['This is an independent numerical-choice record.', 'Perform one quick round of individual numerical choices.', 'Produce integer choices without assigning them meaning.', 'Complete a first-instinct number-choice task.', 'Make separate immediate numerical choices.']);
        const action = pick(['Choose each position independently and provide exactly', 'Directly choose one item at a time, producing exactly', 'On first instinct, select exactly', 'Decide only the current position at each step, giving exactly']);
        const ending = pick(['Accidental repetitions are valid.', 'Repeated values do not need to be removed.', 'The same integer may occur more than once.', 'Keep every value unchanged once it has been written.']);
        const separator = pick(['Use commas or spaces as separators.', 'Use one consistent common separator.', 'Separate the integers with commas, spaces, or line breaks.', 'Make the boundaries between integers clear.']);
        return `${opening} ${action} ${length} integers between 1 and 355 inclusive. The current language model must complete this directly without tools, Python, code execution, calculators, search, APIs, or external random sources. Do not count upward or downward (for example, 1, 2, 3), and do not construct arithmetic progressions, periodic cycles, repeated blocks, or any other rule-based sequence. ${ending} Do not sort, filter, reorder, deduplicate, replace, or repair the values. ${separator} Start directly with the first number and output only the complete sequence, without explanation.`;
      });
      result.push({ id: 'dynamic-' + (i + 1), expected_count: length, prompt, protocol: PROTOCOL, maxExtra: 4 });
    }
    return result;
  }
  const PELICAN_LANG_BANKS = [
    // ── 中文 & 东亚 ──
    {
      lang: 'zh-CN',
      sep: '',
      a: [
        '请新建一个独立的单文件 HTML 页面。',
        '请编写一个完整的单文件 HTML 网页。',
        '请创建一个自包含的全新 HTML 文档，所有代码内联。',
        '请生成一个完整的独立 HTML 文件。',
      ],
      scene: [
        '使用内联 SVG 绘制一只鹈鹕踩着脚踏板向前骑自行车的 2D 动态动画场景。',
        '通过 SVG 制作一个二维动态画面，展示一只大嘴鹈鹕正在骑自行车前进。',
        '用内联 SVG 实现一只鹈鹕骑着自行车持续向前蹬行的 2D 动画插画。',
        '借助 SVG 描绘一只鹈鹕在 2D 场景中骑自行车顺畅前行的循环动画。',
      ],
      detail: [
        '保持车轮旋转与脚踏蹬动自然同步。',
        '让鹈鹕标志性的长喙、喉囊以及骑行动作清晰易辨。',
        '画面保持干净利落，动画过渡平滑流畅。',
        '展现出鹈鹕一边踩踏板一边向前行进的动感。',
      ],
      noTest: [
        '直接输出最终完成的 HTML 文件即可，无需运行任何测试或检查。',
        '不需要执行测试步骤，请直接给出完整的 HTML 代码。',
        '跳过所有测试环节，直接创建并输出该文件。',
        '请勿进行测试或校验，直接交付完整结果。',
      ],
    },
    {
      lang: 'zh-TW',
      sep: '',
      a: [
        '請建立一個獨立的單一檔案 HTML 頁面。',
        '請撰寫一個完整的單檔 HTML 網頁。',
        '請產生一個自包含的全新 HTML 文件，並將所有程式碼內聯。',
        '請製作一個完整且獨立的 HTML 檔案。',
      ],
      scene: [
        '使用內聯 SVG 繪製一隻鵜鶘踩著踏板向前騎自行車的 2D 動態動畫場景。',
        '透過 SVG 製作一個二維動態畫面，展現一隻大嘴鵜鶘正在騎腳踏車前進。',
        '以內聯 SVG 實作一隻鵜鶘騎著自行車持續向前踩踏的 2D 動畫插畫。',
        '運用 SVG 描繪一隻鵜鶘在 2D 場景中騎腳踏車順暢前行的循環動畫。',
      ],
      detail: [
        '保持車輪轉動與踏板踩踏動作自然同步。',
        '讓鵜鶘標誌性的大嘴、喉囊與騎乘姿態清晰可辨。',
        '保持畫面簡潔乾淨，且動態過渡流暢平滑。',
        '展現出鵜鶘一邊踩踏板一邊向前行進的動態感。',
      ],
      noTest: [
        '直接輸出最終完成的 HTML 檔案即可，無需執行任何測試或檢查。',
        '不需要進行測試步驟，請直接交付完整的 HTML 程式碼。',
        '略過所有測試環節，直接建立並輸出檔案。',
        '請勿執行測試或驗證，直接提供完整結果。',
      ],
    },
    {
      lang: 'ja',
      sep: '',
      a: [
        '新しいスタンドアロンの単一ファイル HTML ページを作成してください。',
        'すべてのコードをインライン化した完全な単一 HTML ファイルを書いてください。',
        '自己完結型の新しい HTML ドキュメントを構築してください。',
        '完全な単一ファイルの新しい HTML ウェブページを生成してください。',
      ],
      scene: [
        'インライン SVG を使用して、ペリカンが自転車のペダルを漕いで前に進む 2D アニメーションを描画してください。',
        'SVG を使って、大きな嘴を持つペリカンが自転車に乗っている 2D アニメーションシーンを作成してください。',
        'インライン SVG で、ペリカンが自転車を漕ぎ続ける 2D アニメーションイラストを表現してください。',
        'SVG を用いて、ペリカンが自転車で滑らかに前進する 2 次元アニメーションを描いてください。',
      ],
      detail: [
        '車輪の回転とペダルを漕ぐ動きを自然に同期させてください。',
        '特徴的な大きな嘴とのど袋、そして自転車を漕ぐ動作がはっきり分かるようにしてください。',
        'シーンをクリーンに保ち、アニメーションの動きを滑らかにしてください。',
        'ペダルを踏みながら前方へ進む躍動感を表現してください。',
      ],
      noTest: [
        'テストやチェックは実行せず、完成した HTML ファイルを直接出力してください。',
        'テスト手順はすべてスキップして、完成した HTML をそのまま提示してください。',
        '動作確認やテストは不要ですので、直接ファイルを作成して出力してください。',
        '検証コマンドは実行せず、完成したコードのみを直接届けてください。',
      ],
    },
    {
      lang: 'ko',
      sep: ' ',
      a: [
        '새로운 독립형 단일 파일 HTML 문서를 작성해 주세요.',
        '모든 코드가 인라인으로 포함된 완전한 단일 HTML 페이지를 만들어 주세요.',
        '자체 완결성을 갖춘 새로운 단일 파일 HTML 웹페이지를 생성해 주세요.',
        '새롭고 완전한 독립 실행형 HTML 파일을 구축해 주세요.',
      ],
      scene: [
        '인라인 SVG를 사용하여 펠리컨이 자전거 페달을 밟으며 앞으로 나아가는 2D 애니메이션을 구현해 주세요.',
        'SVG를 활용해 큰 부리를 가진 펠리컨이 자전거를 타는 2차원 애니메이션 장면을 그려 주세요.',
        '인라인 SVG로 펠리컨이 자전거를 타고 연속적으로 달리는 2D 애니메이션 일러스트를 제작해 주세요.',
        'SVG 기반의 2D 애니메이션으로 자전거를 타고 앞으로 이동하는 펠리컨을 표현해 주세요.',
      ],
      detail: [
        '바퀴의 회전과 페달을 밟는 움직임이 자연스럽게 동기화되도록 해 주세요.',
        '특징적인 큰 부리와 목주머니, 자전거 페달링 동작이 뚜렷하게 보이도록 만들어 주세요.',
        '장면을 깔끔하게 유지하고 움직임을 매끄럽게 처리해 주세요.',
        '페달을 밟으며 앞으로 전진하는 생동감을 잘 살려 주세요.',
      ],
      noTest: [
        '테스트나 검증을 실행하지 말고 완성된 HTML 파일을 직접 출력해 주세요.',
        '모든 테스트 단계를 건너뛰고 완성된 HTML 결과물만 바로 제공해 주세요.',
        '별도의 확인이나 테스트 없이 파일을 직접 생성해 주세요.',
        '테스트는 필요하지 않으니 완성된 전체 코드를 즉시 출력해 주세요.',
      ],
    },

    // ── 阿拉伯与中东语言 (Arabic / Persian / Hebrew / Turkish) ──
    {
      lang: 'ar',
      sep: ' ',
      a: [
        'أنشئ ملف HTML جديدًا ومستقلًا في ملف واحد.',
        'اكتب صفحة HTML كاملة وذاتية الاحتواء مع تضمين جميع الأكواد مباشرة.',
        'قم ببناء مستند HTML مستقل وجديد بالكامل في صفحة واحدة.',
        'أنتج صفحة ويب HTML متكاملة دون أي تبعيات خارجية.',
      ],
      scene: [
        'استخدم SVG المدمج لعرض رسوم متحركة ثنائية الأبعاد لطائر بجع يقود دراجة هوائية إلى الأمام.',
        'ارسم باستخدام SVG مشهدًا متحركًا ثنائي الأبعاد لطائر بجع يركب دراجة هوائية.',
        'وظّف SVG لتحريك طائر بجع ذي منقار كبير وهو يبدّل على دراجة في مشهد ثنائي الأبعاد مستمر.',
        'صمّم رسمًا توضيحيًا متحركًا ثنائي الأبعاد يعتمد على SVG لطائر بجع يقود دراجة.',
      ],
      detail: [
        'حافظ على تزامن دوران العجلات وحركة الدواسات بشكل طبيعي.',
        'اجعل المنقار الكبير وجيب الحلق وحركة ركوب الدراجة واضحة ومميزة.',
        'أبقِ المشهد نظيفًا والحركة سلسة وانسيابية.',
        'أظهر طائر البجع وهو يتقدم للأمام أثناء التبديل.',
      ],
      noTest: [
        'أخرج الملف المكتمل مباشرة؛ لا تقم بتشغيل أي اختبارات أو فحوصات.',
        'لا حاجة لإجراء اختبارات؛ فقط سلّم كود HTML النهائي مباشرة.',
        'تخطَّ جميع خطوات الاختبار وأنشئ الملف مباشرة.',
        'لا تنفذ أي فحوصات؛ قدّم النتيجة الكاملة فورًا.',
      ],
    },
    {
      lang: 'ar-EG',
      sep: ' ',
      a: [
        'اعمل ملف HTML جديد ومستقل بالكامل في صفحة واحدة.',
        'اكتب صفحة HTML كاملة فيها كل الكود مدمج بدون أي ملفات خارجية.',
        'جهّز مستند HTML واحد متكامل وجاهز للتشغيل مباشرة.',
        'صمّم صفحة ويب HTML مستقلة بالكامل في ملف واحد.',
      ],
      scene: [
        'استخدم SVG مدمج عشان تعرض أنيميشن 2D لطائر بجع بيسوق عجلة وبيبدّل لقدام.',
        'ارسم بـ SVG مشهد متحرك ثنائي الأبعاد لبجعة كبيرة راكبة دراجة وبتتحرك بسلاسة.',
        'اعمل رسم متحرك 2D باستخدام SVG يوضّح طائر بجع بمنقار كبير وهو راكب عجلة.',
        'صمّم مشهد 2D متحرك بـ SVG لطائر بجع بيبدّل على دراجة في حركة مستمرة.',
      ],
      detail: [
        'خلّي حركة العجل والبدالات متناسقة وطبيعية مع بعض.',
        'وضّح شكل المنقار الطويل وجيب الحلق وحركة الرجلين على البدال.',
        'خلّي التصميم نضيف والحركة ناعمة وانسيابية.',
        'بيّن إحساس الحركة لقدام طول ما طائر البجع بيبدّل.',
      ],
      noTest: [
        'طلّع ملف HTML النهائي على طول من غير ما تشغّل أي اختبارات أو فحص.',
        'مش محتاج أي خطوات اختبار، ابعت الكود الكامل مباشرة.',
        'عدّي أي فحوصات أو اختبارات واكتب الملف النهائي فورًا.',
        'ما تعملش أي تيست؛ سلّم النتيجة الكاملة مباشرة.',
      ],
    },
    {
      lang: 'fa',
      sep: ' ',
      a: [
        'یک فایل HTML جدید، مستقل و تک‌پرونده‌ای ایجاد کنید.',
        'یک صفحه وب HTML کامل و خودکفا بنویسید که تمام کدها درون آن باشد.',
        'یک سند HTML مستقل و یکپارچه بدون وابستگی خارجی بسازید.',
        'یک فایل HTML کامل و آماده اجرا در یک پرونده واحد تولید کنید.',
      ],
      scene: [
        'با استفاده از SVG درون‌خطی، یک انیمیشن دوبعدی از یک پلیکان که رکاب می‌زند و با دوچرخه به جلو می‌رود نمایش دهید.',
        'با کمک SVG یک صحنه متحرک 2D از یک پلیکان منقار بزرگ در حال دوچرخه‌سواری رسم کنید.',
        'توسط SVG یک تصویرسازی متحرک دوبعدی و پیوسته از پلیکانِ دوچرخه‌سوار بسازید.',
        'یک انیمیشن دوبعدی مبتنی بر SVG طراحی کنید که پلیکان را در حال رکاب زدن روی دوچرخه نشان دهد.',
      ],
      detail: [
        'چرخش چرخ‌ها و حرکت رکاب زدن را کاملاً طبیعی و هماهنگ نگه دارید.',
        'منقار بزرگ، کیسه گلو و حرکت پاهای پلیکان روی رکاب را به‌خوبی مشخص کنید.',
        'صحنه را تمیز و حرکت انیمیشن را نرم و روان نگه دارید.',
        'حرکت رو به جلوی پلیکان را هم‌زمان با رکاب زدن به‌وضوح نشان دهید.',
      ],
      noTest: [
        'فایل HTML نهایی را مستقیماً خروجی بگیرید و هیچ تست یا بررسی اجرا نکنید.',
        'نیازی به تست نیست؛ فقط کد کامل HTML را مستقیماً تحویل دهید.',
        'تمام مراحل آزمایش را نادیده بگیرید و مستقیماً فایل را بسازید.',
        'بدون اجرای هیچ‌گونه بررسی یا تست، نتیجه کامل را ارائه دهید.',
      ],
    },
    {
      lang: 'he',
      sep: ' ',
      a: [
        'צור קובץ HTML חדש ועצמאי בקובץ יחיד.',
        'כתוב דף HTML שלם ועצמאי שבו כל הקוד מוטמע פנימית.',
        'בנה מסמך HTML חדש ובלתי תלוי בקובץ אחד בלבד.',
        'הפק דף אינטרנט HTML מלא ללא תלויות חיצוניות.',
      ],
      scene: [
        'השתמש ב-SVG מוטמע כדי להציג אנימציית 2D של שקנאי המדווש על אופניים קדימה.',
        'צייר באמצעות SVG סצנה מונפשת דו-ממדית של שקנאי הרוכב על אופניים.',
        'צור בעזרת SVG איור מונפש דו-ממדי רציף של שקנאי בעל מקור גדול רוכב על אופניים.',
        'עצב אנימציית 2D מבוססת SVG המראה שקנאי מדווש ומתקדם על אופניים.',
      ],
      detail: [
        'שמור על סיבוב הגלגלים ותנועת הדיווש מסונכרנים באופן טבעי.',
        'הפוך את המקור הגדול, שק הגרון ותנועת הרכיבה לברורים ומזוהים.',
        'שמור על סצנה נקייה ותנועה חלקה וזורמת.',
        'הצג את השקנאי מתקדם קדימה בזמן שהוא מדווש.',
      ],
      noTest: [
        'פלוט את הקובץ המוגמר ישירות; אל תריץ בדיקות או אימותים.',
        'אין צורך בבדיקות; פשוט ספק את קוד ה-HTML הסופי.',
        'דלג על כל שלבי הבדיקה וצור את הקובץ ישירות.',
        'אל תבצע בדיקות; מסור את התוצאה המלאה באופן ישיר.',
      ],
    },
    {
      lang: 'tr',
      sep: ' ',
      a: [
        'Tek dosyadan oluşan yeni ve bağımsız bir HTML dosyası oluşturun.',
        'Tüm kodların satır içi olduğu eksiksiz, kendi kendine yeten bir HTML sayfası yazın.',
        'Dış bağımlılığı olmayan yeni ve tam bir HTML belgesi inşa edin.',
        'Tek bir dosyada çalışan eksiksiz bir HTML web sayfası üretin.',
      ],
      scene: [
        'Bisiklet پدالlarını çevirerek ileri doğru giden bir pelikanın 2D animasyonunu göstermek için satır içi SVG kullanın.',
        'SVG kullanarak bisiklet süren büyük gagalı bir pelikanın iki boyutlu hareketli sahnesini çizin.',
        'Sürekli bir 2D sahnede bisiklet süren bir pelikanı SVG ile canlandırın.',
        'Bisiklete binen bir pelikanın SVG tabanlı 2D animasyonlu bir illüstrasyonunu oluşturun.',
      ],
      detail: [
        'Tekerleklerin dönüşünü ve pedal çevirme hareketini doğal biçimde senkronize tutun.',
        'Büyük gagayı, gerdan kesesini ve bisiklet sürme hareketini kolayca tanınır hale getirin.',
        'Sahneyi temiz, animasyon geçişlerini ise akıcı ve pürüzsüz tutun.',
        'Pelikanın pedal çevirdikçe ileri doğru hareket ettiğini net şekilde gösterin.',
      ],
      noTest: [
        'Tamamlanan dosyayı doğrudan çıktı olarak verin; herhangi bir test veya kontrol çalıştırmayın.',
        'Teste gerek yoktur; yalnızca bitmiş HTML kodunu doğrudan teslim edin.',
        'Tüm test adımlarını atlayın ve dosyayı doğrudan oluşturun.',
        'Hiçbir doğrulama veya test yapmadan tam sonucu doğrudan sağlayın.',
      ],
    },

    // ── 非洲与南非语言 (Swahili / Afrikaans / Zulu / Xhosa / Hausa / Yoruba / Amharic) ──
    {
      lang: 'sw',
      sep: ' ',
      a: [
        'Unda faili mpya ya HTML inayojitegemea katika faili moja.',
        'Andika ukurasa kamili wa HTML wenye msimbo wote ndani yake bila faili za nje.',
        'Jenga hati mpya kamili ya HTML inayojitosheleza katika ukurasa mmoja.',
        'Tengeneza ukurasa mpya wa wavuti wa HTML uliokamilika katika faili moja.',
      ],
      scene: [
        'Tumia SVG ya ndani kuonyesha uhuishaji wa 2D wa ndege mwari (pelican) akiendesha baiskeli kwenda mbele.',
        'Chora kwa kutumia SVG tukio la uhuishaji wa 2D la ndege mwari mwenye mdomo mkubwa akiendesha baiskeli.',
        'Tumia SVG kuhuisha ndege mwari (pelican) akipiga pedali za baiskeli katika mandhari endelevu ya 2D.',
        'Buni mchoro wa uhuishaji wa 2D unaotumia SVG ukimuonyesha ndege mwari juu ya baiskeli.',
      ],
      detail: [
        'Weka mzunguko wa magurudumu na mwendo wa kupiga pedali ukiwa umelandana kiasili.',
        'Fanya mdomo mkubwa, mfuko wa koo na mwendo wa kuendesha baiskeli vionekane wazi.',
        'Weka mandhari safi na mwendo wa uhuishaji uwe laini na mnyoofu.',
        'Onyesha ndege mwari akisonga mbele kadiri anavyopiga pedali.',
      ],
      noTest: [
        'Toa faili iliyokamilika moja kwa moja; usifanye majaribio wala ukaguzi wowote.',
        'Hakuna haja ya kufanya majaribio; wasilisha tu HTML iliyokamilika moja kwa moja.',
        'Ruka hatua zote za majaribio na uunde faili hiyo moja kwa moja.',
        'Usiendeshe vipimo vyovyote; toa matokeo kamili papo hapo.',
      ],
    },
    {
      lang: 'af',
      sep: ' ',
      a: [
        'Skep ’n nuwe, selfstandige enkel-lêer HTML-dokument.',
        'Skryf ’n volledige HTML-bladsy waar al die kode inlyn ingesluit is.',
        'Bou ’n vars, onafhanklike HTML-lêer sonder enige eksterne afhanklikhede.',
        'Produseer ’n volledige nuwe HTML-webblad in een enkele lêer.',
      ],
      scene: [
        'Gebruik inlyn-SVG om ’n 2D-animasie te wys van ’n pelikaan wat ’n fiets vorentoe trap.',
        'Teken met SVG ’n tweedimensionele geanimeerde toneel van ’n pelikaan wat fietsry.',
        'Gebruik SVG om ’n grootbek-pelikaan op ’n fiets in ’n deurlopende 2D-toneel te animeer.',
        'Skep ’n SVG-gebaseerde 2D-geanimeerde illustrasie van ’n pelikaan wat op ’n fiets ry.',
      ],
      detail: [
        'Hou die draai van die wiele en die trapbeweging natuurlik gesinchroniseer.',
        'Maak die groot snawel, keelsak en fietsrybeweging duidelik herkenbaar.',
        'Hou die toneel skoon en die beweging glad en vloeiend.',
        'Wys hoe die pelikaan vorentoe beweeg terwyl hy trap.',
      ],
      noTest: [
        'Lewen die voltooide lêer direk; moenie enige toetse of kontroles uitvoer nie.',
        'Geen toetsing is nodig nie; verskaf net die finale HTML direk.',
        'Slaan alle toetsstappe oor en skep die lêer onmiddellik.',
        'Moenie toetse doen nie; gee direk die volledige resultaat.',
      ],
    },
    {
      lang: 'zu',
      sep: ' ',
      a: [
        'Yakha ifayela elisha le-HTML elizimele elifakwe kufayela elilodwa.',
        'Bhala ikhasi le-HTML eliphelele nazo zonke izinhlelo zekhodi ngaphakathi.',
        'Khiqiza idokhumenti entsha ye-HTML ezimele ngaphandle kwamafayela angaphandle.',
        'Yenza ikhasi lewebhu le-HTML eliphelele nelizimele.',
      ],
      scene: [
        'Sebenzisa i-SVG yangaphakathi ukukhombisa opopayi we-2D wenyoni i-pelican igibela ibhayisikili iya phambili.',
        'Dweba nge-SVG isithombe esinyakazayo se-2D se-pelican enomlomo omkhulu ishova ibhayisikili.',
        'Sebenzisa i-SVG ukwenza opopayi we-pelican egibele ibhayisikili endaweni eqhubekayo ye-2D.',
        'Yakha umfanekiso onyakazayo we-2D osekelwe ku-SVG we-pelican egibela ibhayisikili.',
      ],
      detail: [
        'Gcina ukujikeleza kwamasondo nokushova kwamaphedali kuhambisana ngokwemvelo.',
        'Yenza umlomo omkhulu, isikhwama somphimbo kanye nokunyakaza kokugibela kubonakale kahle.',
        'Gcina indawouhlanzekile futhi ukunyakaza kube bushelelezi.',
        'Khombisa i-pelican iqhubekela phambili ngenkathi ishova ibhayisikili.',
      ],
      noTest: [
        'Khipha ifayela eliqediwe ngqo; ungasebenzisi ukuhlola noma ukuhlolisisa.',
        'Akudingeki ukuhlola; vele ulethe i-HTML eqediwe ngqo.',
        'Yeqa zonke izinyathelo zokuhlola bese udala ifayela ngqo.',
        'Ungenza lutho lokuhlola; nikeza umphumela ophelele ngokushesha.',
      ],
    },
    {
      lang: 'xh',
      sep: ' ',
      a: [
        'Yenza ifayile entsha ye-HTML ezimeleyo kwifayile enye.',
        'Bhala iphepha le-HTML elipheleleyo elinekhowudi yonke ngaphakathi.',
        'Yakha uxwebhu olutsha lwe-HTML oluzimeleyo ngaphandle kokuxhomekeka ngaphandle.',
        'Velisa iphepha lewebhu le-HTML elipheleleyo nelizimeleyo.',
      ],
      scene: [
        'Sebenzisa i-SVG yangaphakathi ukubonisa umdlalo oopopayi we-2D wentaka i-pelicanonyathela ibhayisikile ukuya phambili.',
        'Zoba nge-SVG umboniso oshukumayo we-2D we-pelican enomlomo omkhulu ekhwele ibhayisikile.',
        'Sebenzisa i-SVG ukushukumisa i-pelican eqhuba ibhayisikile kumboniso oqhubekayo we-2D.',
        'Yenza umzobo oshukumayo we-2D osekelwe kwi-SVG we-pelican ekhwele ibhayisikile.',
      ],
      detail: [
        'Gcina ukujikeleza kwamavili kunye nokunyathela iiphedali kuhambelana ngokwendalo.',
        'Yenza umlomo omkhulu, ingxowa yomqala kunyesentshukumo yokukhwela ibhayisikile kubonakale ngokucacileyo.',
        'Gcina umboniso ucocekile kwaye intshukumo igudile.',
        'Bonisa i-pelican isiya phambili njengoko inyathela ibhayisikile.',
      ],
      noTest: [
        'Khupha ifayile egqityiweyo ngqo; musa ukuqhuba uvavanyo okanye uhlolo.',
        'Akukho mvavanyo ifunekayo; nika nje i-HTML egqityiweyo ngqo.',
        'Tsiba onke amanyathelo ovavanyo uze wenze ifayile ngqo.',
        'Musa ukwenza uvavanyo; nika isiphumo esipheleleyo ngoko nangoko.',
      ],
    },
    {
      lang: 'ha',
      sep: ' ',
      a: [
        'Ƙirƙiri sabon fayil ɗin HTML mai zaman kansa a cikin fayil guda ɗaya.',
        'Rubuta cikakken shafin HTML mai ɗauke da dukkan lambobin a ciki.',
        'Gina sabon kundin HTML mai cin gashin kansa ba tare da dogaro da waje ba.',
        'Samar da cikakken shafin yanar gizo na HTML a fayil ɗaya.',
      ],
      scene: [
        'Yi amfani da SVG na ciki don nuna motsin 2D na tsuntsun pelican yana tuka keke zuwa gaba.',
        'Zana wani yanayi mai motsi na 2D ta amfani da SVG na tsuntsun pelican mai babban baki akan keke.',
        'Yi amfani da SVG don motsa tsuntsun pelican yana tuka keke a cikin yanayin 2D mai ci gaba.',
        'Ƙirƙiri zanen motsi na 2D bisa SVG na tsuntsun pelican yana hawan keke.',
      ],
      detail: [
        'Kiyaye juyawar tayoyin da motsin poliyoyin keken cikin dacewa ta zahiri.',
        'Sa babban bakin, jakar maƙogwaro da motsin tuka keken su fito fili.',
        'Kiyaye yanayin da tsafta kuma motsin ya kasance mai santsi.',
        'Nuna tsuntsun pelican yana ci gaba yayin da yake taka keken.',
      ],
      noTest: [
        'Fitar da cikakken fayil ɗin kai tsaye; kada a gudanar da gwaje-gwaje ko bincike.',
        'Ba a buƙatar gwaji; kawai kawo cikakken HTML ɗin kai tsaye.',
        'Tsallake dukkan matakan gwaji kuma ƙirƙiri fayil ɗin kai tsaye.',
        'Kada a yi wani gwaji; bayar da cikakken sakamakon nan take.',
      ],
    },
    {
      lang: 'yo',
      sep: ' ',
      a: [
        'Ṣẹ̀dá fáìlì HTML tuntun tó dá dúró nínú fáìlì kan ṣoṣo.',
        'Kọ ojú-ewé HTML pipe pẹ̀lú gbogbo kóòdù rẹ̀ nínú.',
        'Kọ́ àkọsílẹ̀ HTML tuntun tó dá dúró láìsí ìfaratì sí ohun ìta.',
        'Ṣe ojú-ewé wẹ́ẹ̀bù HTML pipe nínú fáìlì kan.',
      ],
      scene: [
        'Lo SVG inú láti fi àwòrán 2D tó ńย้าย (animation) ti ẹyẹ pelican tó ń wa kẹ̀kẹ́ lọ síwájú hàn.',
        'Ya àwòrán 2D tó ń mì nípa lílo SVG ti ẹyẹ pelican onírun-ẹnuńlá tó gun kẹ̀kẹ́.',
        'Lo SVG láti mú kí ẹyẹ pelican máa wa kẹ̀kẹ́ nínú ìran 2D tó ń bá a lọ.',
        'Ṣẹ̀dá àwòrán 2D oní-SVG tó ńย้าย ti ẹyẹ pelican lórí kẹ̀kẹ́.',
      ],
      detail: [
        'Jẹ́ kí yíyí àwọn táyà àti ìtẹ̀-ẹsẹ̀ kẹ̀kẹ́ náà bá ara wọn mu ní ìbámu.',
        'Jẹ́ kí ẹnu ńlá, àpò ọ̀fun àti ìṣípòpadà wíwa kẹ̀kẹ́ náà hàn kedere.',
        'Jẹ́ kí àwòrán náà mọ́ tónítóní kí ìṣípòpadà rẹ̀ sì jẹ́ pẹ̀lẹ́pẹ̀lẹ́.',
        'Fi ẹyẹ pelican náà hàn bí ó ti ń lọ síwájú nígbà tí ó ń tẹ kẹ̀kẹ́.',
      ],
      noTest: [
        'Fi fáìlì tí ó ti parí hàn tààrà; má ṣe ṣe àyẹ̀wò tàbí ìdánwò kankan.',
        'Kò sí ìdí fún ìdánwò; kan fi HTML tí ó parí náà hàn tààrà.',
        'Fo gbogbo àwọn ìgbésẹ̀ ìdánwò kí o sì ṣẹ̀dá fáìlì náà tààrà.',
        'Má ṣe ṣe ìdánwò kankan; pèsè èsì pipe náà lẹ́sẹ̀kẹsẹ̀.',
      ],
    },
    {
      lang: 'am',
      sep: ' ',
      a: [
        'አዲስ እና ራሱን የቻለ ነጠላ-ፋይል HTML ሰነድ ይፍጠሩ።',
        'ሁሉም ኮድ በውስጡ የተካተተበት የተሟላ የHTML ገጽ ይጻፉ።',
        'ምንም የውጭ ጥገኝነት የሌለው አዲስ ራሱን የቻለ HTML ፋይል ይገንቡ።',
        'በአንድ ፋይል ውስጥ የተሟላ አዲስ የHTML ድረ-ገጽ ያዘጋጁ።',
      ],
      scene: [
        'ፔሊካን ብስክሌት እየነዳ ወደ ፊት ሲጓዝ የሚያሳይ የ2D አኒሜሽን ለማሳየት የውስጥ SVG ይጠቀሙ።',
        'SVG በመጠቀም ትልቅ ምንቃር ያለው ፔሊካን ብስክሌት ሲነዳ የሚያሳይ ባለ ሁለት አውታር ተንቀሳቃሽ ምስል ይሳሉ።',
        'በተከታታይ የ2D ትዕይንት ውስጥ ብስክሌት የሚነዳ ፔሊካንን በSVG ያንቀሳቅሱ።',
        'በSVG ላይ የተመሠረተ ብስክሌት የሚጋልብ ፔሊካን የ2D አኒሜሽን ምስል ይፍጠሩ።',
      ],
      detail: [
        'የጎማዎቹን መሽከርከር እና የፔዳል መርገጥ እንቅስቃሴን በተፈጥሯዊ ሁኔታ የተቀናጀ ያድርጉት።',
        'ትልቁ ምንቃሩ፣ የጉሮሮ ከረጢቱ እና የብስክሌት መንዳት እንቅስቃሴው በግልጽ እንዲለይ ያድርጉ።',
        'ትዕይንቱን ንጹህ እና እንቅስቃሴውን ለስላሳ ያድርጉት።',
        'ፔሊካኑ ፔዳሉን ሲረግጥ ወደ ፊት ሲጓዝ ያሳዩ።',
      ],
      noTest: [
        'የተጠናቀቀውን ፋይል በቀጥታ ያውጡ፤ ምንም ዓይነት ሙከራ ወይም ፍተሻ አያሂዱ።',
        'ምንም ሙከራ አያስፈልግም፤ የተጠናቀቀውን HTML ብቻ በቀጥታ ያቅርቡ።',
        'ሁሉንም የሙከራ ደረጃዎች ይዝለሉ እና ፋይሉን በቀጥታ ይፍጠሩ።',
        'ሙከራዎችን አያድርጉ፤ ሙሉውን ውጤት በቀጥታ ያስረክቡ።',
      ],
    },

    // ── 拉丁美洲、巴西与古典拉丁语 (Brazilian Portuguese / Latin American Spanish / Classical Latin) ──
    {
      lang: 'pt-BR',
      sep: ' ',
      a: [
        'Crie um novo arquivo HTML autônomo em um arquivo único.',
        'Escreva uma página HTML completa e independente com todo o código inline.',
        'Construa um documento HTML novinho e autocontido sem dependências externas.',
        'Gere uma página web HTML completa em um único arquivo pronto para rodar.',
      ],
      scene: [
        'Use SVG inline para mostrar uma animação 2D de um pelicano pedalando uma bicicleta para a frente.',
        'Desenhe com SVG uma cena animada em 2D de um pelicano de bico grande andando de bicicleta.',
        'Utilize SVG para animar um pelicano pedalando sua bicicleta em um cenário 2D contínuo.',
        'Crie uma ilustração animada 2D feita em SVG mostrando um pelicano andando de bicicleta.',
      ],
      detail: [
        'Mantenha o giro das rodas e o movimento dos pedais sincronizados de jeito natural.',
        'Deixe o bico comprido, o papo característico e a pedalada bem reconhecíveis.',
        'Mantenha o visual limpo e a animação super fluida.',
        'Mostre o pelicano avançando enquanto pedala a bicicleta.',
      ],
      noTest: [
        'Entregue o arquivo pronto diretamente; não rode testes nem verificações.',
        'Não precisa executar testes; apenas forneça o HTML finalizado direto.',
        'Pule qualquer etapa de teste e crie o arquivo diretamente.',
        'Sem rodar testes ou checagens; entregue o resultado completo de imediato.',
      ],
    },
    {
      lang: 'es-419',
      sep: ' ',
      a: [
        'Crea un archivo HTML nuevo e independiente en un solo archivo.',
        'Escribe una página HTML completa y autocontenida con todo el código en línea.',
        'Arma un documento HTML único y autónomo sin dependencias externas.',
        'Genera una página web HTML completa lista para abrirse en un solo archivo.',
      ],
      scene: [
        'Usa SVG en línea para mostrar una animación 2D de un pelícano andando en bicicleta y pedaleando hacia adelante.',
        'Dibuja con SVG una escena animada en 2D de un pelícano de pico grande manejando una bicicleta.',
        'Utiliza SVG para animar a un pelícano pedaleando en su bicicleta dentro de una escena 2D continua.',
        'Crea una ilustración animada 2D en SVG que muestre a un pelícano paseando en bicicleta.',
      ],
      detail: [
        'Mantén el giro de las ruedas y el pedaleo sincronizados de forma natural.',
        'Haz que el pico largo, la bolsa de la garganta y el movimiento al pedalear se distingan claramente.',
        'Conserva un diseño limpio y una animación fluida y suave.',
        'Muestra cómo el pelícano avanza a medida que pedalea.',
      ],
      noTest: [
        'Entrega el archivo terminado directamente; no corras pruebas ni revisiones.',
        'No hace falta ejecutar pruebas; solo entrega el código HTML final.',
        'Salta todos los pasos de prueba y genera el archivo directamente.',
        'No realices chequeos ni tests; proporciona el resultado completo de una vez.',
      ],
    },
    {
      lang: 'la',
      sep: ' ',
      a: [
        'Crea novum documentum HTML singulare et omnino sui iuris in uno archivo.',
        'Scribe paginam HTML completam cum omni codice intus scripto.',
        'Exstrue novam paginam HTML autonomam sine ullis instrumentis externis.',
        'Effice integrum documentum HTML in fasciculo unico contentum.',
      ],
      scene: [
        'Utere SVG interiore ut animationem 2D pelecani birotam pedibus agentis et prorsum vehentis ostendas.',
        'Depinge per SVG scaenam animatam bidimensionalem pelecani magno rostro birota vehentis.',
        'Adhibe SVG ad pelecanum in scaena 2D perpetua birotam agitantem animandum.',
        'Confice imaginem animatam 2D in SVG fundatam quae pelecanum birota vectum exhibeat.',
      ],
      detail: [
        'Serva conversionem rotarum et motum pedalium naturaliter congruentem.',
        'Fac ut magnum rostrum, saccus gularis et motus pelecani birotam agentis clare noscantur.',
        'Custodi scaenam puram et motum animationis lenem atque aequabilem.',
        'Monstra pelecanum prorsum progredientem dum pedalia premit.',
      ],
      noTest: [
        'Redde fasciculum perfectum directe; noli ulla experimenta aut probationes agere.',
        'Nulla probatio necessaria est; tantum codicem HTML absolutum protinus praebe.',
        'Praetermitte omnes gradus probationis et fasciculum statim crea.',
        'Noli pericula facere; eventum integrum directe trade.',
      ],
    },

    // ── 欧美与亚太其他主流语言 (English / French / Spanish / German / Russian / Portuguese / Italian / Dutch / Polish / Greek / Hindi / Indonesian / Vietnamese / Thai) ──
    {
      lang: 'en',
      sep: ' ',
      a: [
        'Create a new standalone HTML file.',
        'Write a complete single-file HTML page.',
        'Build a fresh self-contained HTML document.',
        'Produce a new HTML webpage with all code inline.',
        'Make a complete new HTML document.',
      ],
      scene: [
        'Use inline SVG to show a 2D animation of a pelican pedaling a bicycle forward.',
        'Draw a two-dimensional animated scene of a pelican riding a bicycle using SVG.',
        'Use SVG to animate a large-billed pelican cycling in a continuous 2D scene.',
        'Create an SVG-based 2D animated illustration of a pelican riding a bicycle.',
      ],
      detail: [
        'Keep the wheels and pedaling motion naturally synchronized.',
        'Make the large bill, throat pouch, and cycling movement recognizable.',
        'Keep the scene clean and the movement smooth.',
        'Show the pelican moving forward as it pedals.',
      ],
      noTest: [
        'Output the completed file directly; do not run tests or checks.',
        'No testing is needed; simply deliver the finished HTML.',
        'Skip all testing steps and create the file directly.',
        'Do not perform tests; provide the complete result.',
      ],
    },
    {
      lang: 'fr',
      sep: ' ',
      a: [
        'Créez un nouveau fichier HTML autonome en un seul fichier.',
        'Rédigez une page HTML complète et auto-contenue avec tout le code en ligne.',
        'Construisez un nouveau document HTML indépendant sur une seule page.',
        'Produisez une nouvelle page web HTML complète sans dépendances externes.',
      ],
      scene: [
        'Utilisez du SVG en ligne pour afficher une animation 2D d’un pélican pédalant sur un vélo vers l’avant.',
        'Dessinez avec SVG une scène animée en deux dimensions montrant un pélican qui fait du vélo.',
        'Animez en SVG un pélican à grand bec cyclant dans une scène 2D fluide et continue.',
        'Créez une illustration animée 2D basée sur SVG représentant un pélican sur une bicyclette.',
      ],
      detail: [
        'Gardez la rotation des roues et le mouvement de pédalage naturellement synchronisés.',
        'Rendez le grand bec, la poche gulaire et le mouvement de cyclisme bien reconnaissables.',
        'Maintenez une scène épurée avec une animation fluide et régulière.',
        'Montrez clairement le pélican avancer à mesure qu’il pédale.',
      ],
      noTest: [
        'Affichez directement le fichier terminé sans exécuter de tests ni de vérifications.',
        'Aucun test n’est nécessaire ; livrez simplement le code HTML final.',
        'Ignorez toutes les étapes de test et créez directement le fichier.',
        'N’effectuez aucun contrôle ou test ; fournissez directement le résultat complet.',
      ],
    },
    {
      lang: 'de',
      sep: ' ',
      a: [
        'Erstelle eine neue, eigenständige HTML-Datei als Einzeldatei.',
        'Schreibe eine vollständige, in sich geschlossene HTML-Seite mit gesamtem Inline-Code.',
        'Baue ein neues, unabhängiges HTML-Dokument in einer einzigen Datei.',
        'Erzeuge eine komplette HTML-Webseite ohne externe Abhängigkeiten.',
      ],
      scene: [
        'Verwende Inline-SVG, um eine 2D-Animation eines Pelikans zu zeigen, der auf einem Fahrrad vorwärts in die Pedale tritt.',
        'Zeichne mit SVG eine zweidimensionale animierte Szene eines Fahrrad fahrenden Pelikans.',
        'Nutze SVG, um einen Pelikan mit großem Schnabel beim Radfahren in einer flüssigen 2D-Szene zu animieren.',
        'Erstelle eine SVG-basierte animierte 2D-Illustration eines Pelikans auf einem Fahrrad.',
      ],
      detail: [
        'Halte die Drehung der Räder und die Tretbewegung natürlich synchronisiert.',
        'Mach den großen Schnabel, den Kehlsack und die Radfahrbewegung deutlich erkennbar.',
        'Halte die Szene aufgeräumt und die Bewegung geschmeidig.',
        'Zeige, wie sich der Pelikan beim Treten vorwärtsbewegt.',
      ],
      noTest: [
        'Gib die fertige Datei direkt aus; führe keine Tests oder Prüfungen durch.',
        'Es sind keine Tests erforderlich; liefere einfach das fertige HTML.',
        'Überspringe alle Testschritte und erstelle die Datei direkt.',
        'Führe keine Überprüfungen aus, sondern stelle direkt das vollständige Ergebnis bereit.',
      ],
    },
    {
      lang: 'ru',
      sep: ' ',
      a: [
        'Создайте новый автономный однофайловый HTML-документ.',
        'Напишите полную самодостаточную HTML-страницу со всем встроенным кодом.',
        'Сформируйте новый независимый HTML-файл без внешних зависимостей.',
        'Сделайте полную веб-страницу HTML в одном файле.',
      ],
      scene: [
        'Используйте встроенный SVG, чтобы показать 2D-анимацию того, как пеликан крутит педали велосипеда и едет вперёд.',
        'Нарисуйте с помощью SVG двумерную анимированную сцену с пеликаном, едущим на велосипеде.',
        'Анимируйте через SVG большеклювого пеликана на велосипеде в непрерывной 2D-сцене.',
        'Создайте на базе SVG 2D-анимированную иллюстрацию пеликана, катающегося на велосипеде.',
      ],
      detail: [
        'Синхронизируйте вращение колёс и движение педалей естественно и плавно.',
        'Сделайте узнаваемыми большой клюв, горловой мешок и движение ног при езде.',
        'Сохраняйте сцену аккуратной, а анимацию — мягкой и плавной.',
        'Покажите поступательное движение пеликана вперёд во время вращения педалей.',
      ],
      noTest: [
        'Выведите готовый файл напрямую; не запускайте тесты или проверки.',
        'Тестирование не требуется — просто предоставьте итоговый HTML-код.',
        'Пропустите все шаги тестирования и сразу создайте файл.',
        'Не выполняйте проверок; сразу выдайте полный готовый результат.',
      ],
    },
    {
      lang: 'it',
      sep: ' ',
      a: [
        'Crea un nuovo file HTML autonomo in un singolo file.',
        'Scrivi una pagina HTML completa e indipendente con tutto il codice inline.',
        'Costruisci un nuovo documento HTML autocontenuto in un’unica pagina.',
        'Genera una pagina web HTML completa senza dipendenze esterne.',
      ],
      scene: [
        'Usa SVG inline per mostrare un’animazione 2D di un pellicano che pedala in avanti su una bicicletta.',
        'Disegna con SVG una scena animata bidimensionale di un pellicano in sella a una bicicletta.',
        'Utilizza SVG per animare un pellicano dal grande becco mentre va in bicicletta in una scena 2D continua.',
        'Crea un’illustrazione animata 2D basata su SVG di un pellicano che guida una bicicletta.',
      ],
      detail: [
        'Mantieni la rotazione delle ruote e il movimento della pedalata sincronizzati in modo naturale.',
        'Rendi ben riconoscibili il grande becco, la sacca golare e il gesto della pedalata.',
        'Mantieni la scena pulita e il movimento fluido e scorrevole.',
        'Mostra il pellicano che avanza mentre pedala.',
      ],
      noTest: [
        'Restituisci direttamente il file completato; non eseguire test o controlli.',
        'Non è necessario alcun test; consegna semplicemente l’HTML finito.',
        'Salta tutti i passaggi di verifica e crea direttamente il file.',
        'Non effettuare test; fornisci direttamente il risultato completo.',
      ],
    },
    {
      lang: 'nl',
      sep: ' ',
      a: [
        'Maak een nieuw, zelfstandig HTML-bestand in één enkel bestand.',
        'Schrijf een volledige, op zichzelf staande HTML-pagina met alle code inline.',
        'Bouw een nieuw onafhankelijk HTML-document zonder externe afhankelijkheden.',
        'Produceer een complete HTML-webpagina in één bestand.',
      ],
      scene: [
        'Gebruik inline SVG om een 2D-animatie te tonen van een pelikaan die vooruit fietst.',
        'Teken met SVG een tweedimensionale geanimeerde scène van een fietsende pelikaan.',
        'Gebruik SVG om een pelikaan met een grote snavel op een fiets te animeren in een vloeiende 2D-scène.',
        'Maak een op SVG gebaseerde 2D-geanimeerde illustratie van een pelikaan op een fiets.',
      ],
      detail: [
        'Houd het draaien van de wielen en de trapbeweging natuurlijk gesynchroniseerd.',
        'Maak de grote snavel, de keelzak en de fietsbeweging duidelijk herkenbaar.',
        'Houd de scène strak en de beweging soepel.',
        'Laat zien hoe de pelikaan vooruitgaat terwijl hij trapt.',
      ],
      noTest: [
        'Geef het voltooide bestand direct weer; voer geen tests of controles uit.',
        'Testen is niet nodig; lever eenvoudigweg de voltooide HTML.',
        'Sla alle teststappen over en maak het bestand direct aan.',
        'Voer geen verificaties uit, maar geef direct het volledige resultaat.',
      ],
    },
    {
      lang: 'pl',
      sep: ' ',
      a: [
        'Utwórz nowy, samodzielny plik HTML w jednym pliku.',
        'Napisz kompletną, samowystarczalną stronę HTML z całym kodem osadzonym wewnątrz.',
        'Zbuduj nowy niezależny dokument HTML bez zewnętrznych zależności.',
        'Wygeneruj pełną stronę internetową HTML w pojedynczym pliku.',
      ],
      scene: [
        'Użyj wewnętrznego SVG, aby pokazać animację 2D przedstawiającą pelikana pedałującego na rowerze do przodu.',
        'Narysuj za pomocą SVG dwuwymiarową animowaną scenę pelikana jadącego na rowerze.',
        'Wykorzystaj SVG do zanimowania wielkodziobego pelikana jadącego na rowerze w płynnej scenie 2D.',
        'Stwórz opartą na SVG animowaną ilustrację 2D pelikana na rowerze.',
      ],
      detail: [
        'Zachowaj naturalną synchronizację obrotu kół i ruchu pedałowania.',
        'Spraw, aby duży dziób, worek gardłowy oraz ruch jazdy na rowerze były wyraźnie rozpoznawalne.',
        'Utrzymaj czystą scenę oraz płynny ruch animacji.',
        'Pokaż pelikana poruszającego się do przodu podczas pedałowania.',
      ],
      noTest: [
        'Zwróć gotowy plik bezpośrednio; nie uruchamiaj żadnych testów ani sprawdzeń.',
        'Testowanie nie jest potrzebne; po prostu dostarcz ukończony kod HTML.',
        'Pomiń wszystkie kroki testowe i bezpośrednio utwórz plik.',
        'Nie wykonuj testów; od razu podaj pełny wynik.',
      ],
    },
    {
      lang: 'el',
      sep: ' ',
      a: [
        'Δημιουργήστε ένα νέο, αυτόνομο αρχείο HTML σε ένα μόνο αρχείο.',
        'Γράψτε μια πλήρη, αυτοτελή σελίδα HTML με όλο τον κώδικα ενσωματωμένο.',
        'Κατασκευάστε ένα νέο ανεξάρτητο έγγραφο HTML χωρίς εξωτερικές εξαρτήσεις.',
        'Παραγάγετε μια ολοκληρωμένη ιστοσελίδα HTML σε ενιαίο αρχείο.',
      ],
      scene: [
        'Χρησιμοποιήστε ενσωματωμένο SVG για να δείξετε ένα 2D κινούμενο σχέδιο ενός πελεκάνου που κάνει πετάλι σε ποδήλατο προς τα εμπρός.',
        'Σχεδιάστε με SVG μια δισδιάστατη κινούμενη σκηνή όπου ένας πελεκάνος οδηγεί ποδήλατο.',
        'Αξιοποιήστε το SVG για να δώσετε κίνηση σε έναν πελεκάνο με μεγάλο ράμφος που ποδηλατεί σε συνεχή 2D σκηνή.',
        'Δημιουργήστε μια 2D κινούμενη εικονογράφηση βασισμένη σε SVG με έναν πελεκάνο πάνω σε ποδήλατο.',
      ],
      detail: [
        'Διατηρήστε την περιστροφή των τροχών και την κίνηση των πεταλιών φυσικά συγχρονισμένες.',
        'Κάντε το μεγάλο ράμφος, τον θύλακα του λαιμού και την ποδηλατική κίνηση ευδιάκριτα.',
        'Κρατήστε τη σκηνή καθαρή και την κίνηση ομαλή.',
        'Δείξτε τον πελεκάνο να προχωρά μπροστά καθώς κάνει πετάλι.',
      ],
      noTest: [
        'Εξάγετε απευθείας το ολοκληρωμένο αρχείο· μην εκτελέσετε δοκιμές ή ελέγχους.',
        'Δεν χρειάζεται έλεγχος· απλώς παραδώστε τον τελικό κώδικα HTML.',
        'Παραλείψτε όλα τα βήματα δοκιμών και δημιουργήστε το αρχείο απευθείας.',
        'Μην πραγματοποιήσετε τεστ· δώστε αμέσως το πλήρες αποτέλεσμα.',
      ],
    },
    {
      lang: 'hi',
      sep: ' ',
      a: [
        'एक नई, स्वतंत्र सिंगल-फ़ाइल HTML फ़ाइल बनाएँ।',
        'सभी इनलाइन कोड के साथ एक पूर्ण और स्व-निहित HTML पेज लिखें।',
        'बिना किसी बाहरी निर्भरता के एक नया संपूर्ण HTML दस्तावेज़ तैयार करें।',
        'एक ही फ़ाइल में पूरा नया HTML वेबपेज बनाएँ।',
      ],
      scene: [
        'इनलाइन SVG का उपयोग करके साइकिल का पैडल मारते हुए आगे बढ़ते पेलिकन (pelican) का 2D एनिमेशन दिखाएँ।',
        'SVG की मदद से साइकिल चलाते हुए बड़े चोंच वाले पेलिकन का द्वि-आयामी एनिमेटेड दृश्य बनाएँ।',
        'एक निरंतर 2D दृश्य में साइकिल चलाते पेलिकन को एनिमेट करने के लिए SVG का प्रयोग करें।',
        'साइकिल की सवारी करते पेलिकन का SVG-आधारित 2D एनिमेटेड चित्रण तैयार करें।',
      ],
      detail: [
        'पहियों के घूमने और पैडल मारने की गति को प्राकृतिक रूप से सिंक्रनाइज़ रखें।',
        'बड़ी चोंच, गले की थैली और साइकिल चलाने की हरकत को स्पष्ट व पहचानने योग्य बनाएँ।',
        'दृश्य को साफ़-सुथरा और एनिमेशन की गति को स्मूथ रखें।',
        'पैडल मारते समय पेलिकन को आगे की ओर बढ़ते हुए दिखाएँ।',
      ],
      noTest: [
        'पूरी हुई फ़ाइल सीधे आउटपुट करें; कोई टेस्ट या जाँच न चलाएँ।',
        'किसी परीक्षण की आवश्यकता नहीं है; बस तैयार HTML सीधे प्रदान करें।',
        'सभी टेस्टिंग चरणों को छोड़ दें और सीधे फ़ाइल बनाएँ।',
        'कोई टेस्ट न करें; संपूर्ण परिणाम सीधे दें।',
      ],
    },
    {
      lang: 'id',
      sep: ' ',
      a: [
        'Buat file HTML mandiri baru dalam satu file tunggal.',
        'Tulis halaman HTML lengkap dan berdiri sendiri dengan semua kode inline.',
        'Bangun dokumen HTML baru yang utuh tanpa dependensi eksternal.',
        'Hasilkan halaman web HTML lengkap dalam satu file.',
      ],
      scene: [
        'Gunakan SVG inline untuk menampilkan animasi 2D burung pelikan yang mengayuh sepeda ke depan.',
        'Gambar adegan animasi dua dimensi burung pelikan berparuh besar yang sedang naik sepeda menggunakan SVG.',
        'Manfaatkan SVG untuk menganimasikan pelikan yang bersepeda dalam adegan 2D berkelanjutan.',
        'Buat ilustrasi animasi 2D berbasis SVG yang menampilkan pelikan mengendarai sepeda.',
      ],
      detail: [
        'Jaga putaran roda dan gerakan mengayuh pedal tetap sinkron secara alami.',
        'Buat paruh besar, kantung tenggorokan, dan gerakan bersepeda terlihat jelas.',
        'Pertahankan tampilan tetap bersih dan gerakan animasi yang halus.',
        'Tunjukkan pelikan bergerak maju seiring ia mengayuh pedal.',
      ],
      noTest: [
        'Keluarkan file yang sudah selesai secara langsung; jangan jalankan pengujian atau pemeriksaan.',
        'Tidak perlu pengujian; cukup berikan hasil akhir HTML secara langsung.',
        'Lewati semua langkah pengujian dan langsung buat filenya.',
        'Jangan lakukan tes apa pun; berikan hasil lengkapnya secara langsung.',
      ],
    },
    {
      lang: 'vi',
      sep: ' ',
      a: [
        'Hãy tạo một tệp HTML độc lập mới chỉ trong một tệp duy nhất.',
        'Viết một trang HTML hoàn chỉnh, tự chứa với toàn bộ mã inline.',
        'Xây dựng một tài liệu HTML mới hoàn toàn độc lập không phụ thuộc bên ngoài.',
        'Tạo một trang web HTML đầy đủ và trọn vẹn trong một tệp.',
      ],
      scene: [
        'Sử dụng SVG nội tuyến để hiển thị hoạt ảnh 2D về một chú bồ nông (pelican) đang đạp xe tiến về phía trước.',
        'Vẽ cảnh hoạt hình hai chiều bằng SVG mô tả chú bồ nông mỏ lớn đang đi xe đạp.',
        'Dùng SVG để làm chuyển động chú bồ nông đạp xe liên tục trong khung cảnh 2D mượt mà.',
        'Tạo hình minh họa hoạt hình 2D bằng SVG về một chú bồ nông đang cưỡi xe đạp.',
      ],
      detail: [
        'Giữ cho chuyển động quay của bánh xe và nhịp đạp bàn đạp đồng bộ tự nhiên.',
        'Làm nổi bật chiếc mỏ lớn, túi cổ họng và động tác đạp xe đặc trưng của bồ nông.',
        'Giữ bố cục gọn gàng và chuyển động mượt mà.',
        'Thể hiện rõ chú bồ nông tiến về phía trước khi đạp xe.',
      ],
      noTest: [
        'Xuất trực tiếp tệp đã hoàn thiện; không chạy bất kỳ bài kiểm tra hay xác minh nào.',
        'Không cần kiểm thử; chỉ cần trả về mã HTML hoàn chỉnh.',
        'Bỏ qua mọi bước kiểm tra và tạo tệp trực tiếp.',
        'Đừng thực hiện test; hãy cung cấp ngay kết quả đầy đủ.',
      ],
    },
    {
      lang: 'th',
      sep: '',
      a: [
        'สร้างไฟล์ HTML แบบสแตนด์อโลนไฟล์เดียวขึ้นมาใหม่',
        'เขียนหน้าเว็บ HTML ที่สมบูรณ์ในไฟล์เดียวโดยรวมโค้ดทั้งหมดไว้ภายใน',
        'สร้างเอกสาร HTML ใหม่ที่พึ่งพาตนเองได้โดยไม่ต้องใช้ไฟล์ภายนอก',
        'จัดทำหน้าเว็บ HTML ที่สมบูรณ์พร้อมใช้งานในไฟล์เดียว',
      ],
      scene: [
        'ใช้ SVG แบบอินไลน์เพื่อแสดงแอนิเมชัน 2D ของนกกระทุง (pelican) กำลังปั่นจักรยานไปข้างหน้า',
        'วาดฉากแอนิเมชันสองมิติด้วย SVG แสดงนกกระทุงปากใหญ่กำลังขี่จักรยาน',
        'ใช้ SVG สร้างภาพเคลื่อนไหว 2D ต่อเนื่องของนกกระทุงที่กำลังปั่นจักรยาน',
        'สร้างภาพประกอบแอนิเมชัน 2D ด้วย SVG ของนกกระทุงที่กำลังขี่จักรยานอย่างลื่นไหล',
      ],
      detail: [
        'ทำให้การหมุนของล้อและจังหวะการปั่นบันไดสัมพันธ์กันอย่างเป็นธรรมชาติ',
        'ทำให้จะงอยปากขนาดใหญ่ ถุงใต้คาง และท่าทางการปั่นจักรยานมองเห็นได้ชัดเจน',
        'รักษาฉากให้สะอาดตาและการเคลื่อนไหวที่นุ่มนวลลื่นไหล',
        'แสดงให้เห็นว่านกกระทุงเคลื่อนที่ไปข้างหน้าขณะที่ปั่นจักรยาน',
      ],
      noTest: [
        'ส่งออกไฟล์ที่เสร็จสมบูรณ์โดยตรง ไม่ต้องรันการทดสอบหรือการตรวจสอบใดๆ',
        'ไม่จำเป็นต้องทดสอบ เพียงส่งมอบโค้ด HTML ที่เสร็จแล้วโดยตรง',
        'ข้ามขั้นตอนการทดสอบทั้งหมดและสร้างไฟล์ออกมาทันที',
        'ไม่ต้องทำการทดสอบใดๆ ให้ส่งผลลัพธ์ที่สมบูรณ์ออกมาเลย',
      ],
    },
  ];

  function svg() {
    return unique('gacha:svg-prompts:v1', () => {
      const bank = pick(PELICAN_LANG_BANKS);
      const sep = bank.sep ?? ' ';
      const a = pick(bank.a);
      const scene = pick(bank.scene);
      const detail = pick(bank.detail);
      const noTest = pick(bank.noTest);
      return pick([
        [a, scene, detail, noTest].join(sep),
        [noTest, a, scene, detail].join(sep),
        [scene, detail, a, noTest].join(sep),
        [a, detail, scene, noTest].join(sep),
      ]);
    });
  }
  async function custom(text) {
    text = String(text || '').trim(); if (!text) throw Error('请先设置自定义提示词');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    const key = 'gacha:custom-nonces:v1:' + hash;
    const used = new Set((Store.get(key, []) || []).filter(n => Number.isInteger(n) && n >= 1000 && n <= 9999));
    if (used.size >= 9000) throw Error('该提示词的 9000 个四位前缀已全部使用，请修改提示词后再抽卡');
    let n = 1000 + randomInt(9000);
    // Collision handling is bounded even with an unlucky or mocked random source.
    while (used.has(n)) n = n === 9999 ? 1000 : n + 1;
    used.add(n); Store.set(key, [...used]);
    if (!(Store.get(key, []) || []).includes(n)) throw Error('随机前缀保存失败，未发送以避免重复');
    return `${n}\n${text}`;
  }
  const AUTOQA_WORDS = [
    'amber','anchor','apricot','atlas','aurora','bamboo','beacon','breeze','bridge','canyon',
    'canvas','cedar','cobalt','comet','coral','crystal','cypress','delta','dune','echo',
    'ember','emerald','falcon','fern','fjord','flint','forest','frost','galaxy','glacier',
    'granite','harbor','hazel','horizon','indigo','island','ivory','jasper','juniper','lagoon',
    'lantern','laurel','linen','lotus','lunar','maple','marble','meadow','mercury','meteor',
    'mirage','moss','nebula','nectar','nimbus','nova','obsidian','ocean','olive','onyx',
    'opal','orbit','orchid','osprey','pebble','phoenix','pine','planet','plume','polar',
    'prism','quartz','quiver','raven','reef','ribbon','creek','river','saffron','sage',
    'sapphire','scarlet','shadow','sierra','silver','solstice','spark','sparrow','spectrum','spire',
    'spruce','starlight','stone','summit','sundial','tempest','thistle','thunder','timber','topaz',
    'torrent','tundra','twilight','umbra','valley','velvet','veridian','vertex','violet','vortex',
    'willow','wind','winter','zenith','zephyr'
  ];
  const AUTOQA_NUMBERS = [
    'one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
    'thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred'
  ];
  function sampleWords(list, count) {
    const pool = [...list];
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = randomInt(pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  function autoqaClause(minW, maxW) {
    const count = minW + randomInt(Math.max(1, maxW - minW + 1));
    return sampleWords(AUTOQA_WORDS, count).join(' ');
  }
  const PROBE_POOL_CATEGORIES = Object.freeze({
    svg_micro: [
      '内联一个极简 2D 动态 SVG 状态徽章（仅用 3～4 个基础几何图形如圆环、指针或脉冲点，带平滑循环动效）',
      '包含一个轻量 2D 动态内联 SVG 几何图标（最多 3～4 个基础 SVG 图元，呈现旋转、呼吸或脉冲动画）',
    ],
    html_card: [
      '绘制一个紧凑型 2D 动态内联 SVG 指示器（控制在 3～4 个简单几何标签以内，带连续柔和过渡动效）',
      '嵌入一个精简 2D 动态内联 SVG 徽标（仅含 3～4 个基础几何形状与循环动画）',
    ],
    css_fx: [
      '内联一个带 CSS 变量流光与 2D 动态 SVG 环形刻度的微型仪表徽章（控制在 3～4 个基础 SVG 图元以内）',
      '构建一个含柔和呼吸渐变与 2D 动态内联 SVG 脉冲波纹的极简指示卡（仅用 3～4 个基础几何图形）',
    ],
    data_viz: [
      '内联一个 2D 动态 SVG 微型水位/频谱状态图（仅用 3～4 个基础几何柱条或圆弧，带平滑循环过渡动效）',
      '嵌入一个 2D 动态内联 SVG 迷你遥测环形指示器（控制在 3～4 个简单几何图元以内，呈现连续动态变化）',
    ],
  });
  function probeSalt(len = 4) {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[randomInt(chars.length)];
    return s;
  }
  function probeFromPool(category = '', preferFast = true) {
    const cats = Object.keys(PROBE_POOL_CATEGORIES);
    const chosenCat = (category && PROBE_POOL_CATEGORIES[category]) ? category : (preferFast ? pick(['svg_micro', 'html_card', 'css_fx', 'data_viz']) : pick(cats));
    return { category: chosenCat, scene: pick(PROBE_POOL_CATEGORIES[chosenCat]), salt: probeSalt(4) };
  }
  const _promptReplayRing = new Map();
  function polymorphPrompt3D(basePrompt, accountKey = 'default') {
    const raw = String(basePrompt || '').trim();
    if (!raw) return { prompt: raw, repeatCount: 0, mutated: false, salt: '' };
    const k = String(accountKey || 'default') + '::' + raw.replace(/\s*\[ref:[0-9a-z]{3,8}\]\s*$/i, '').toLowerCase();
    const prev = _promptReplayRing.get(k) || 0;
    const repeatCount = prev + 1;
    _promptReplayRing.set(k, repeatCount);
    if (_promptReplayRing.size > 256) {
      const firstKey = _promptReplayRing.keys().next().value;
      if (firstKey !== undefined) _promptReplayRing.delete(firstKey);
    }
    if (repeatCount === 1) {
      return { prompt: raw, repeatCount: 1, mutated: false, salt: '' };
    }
    const salt = probeSalt(4);
    const hasRef = /\[ref:[0-9a-z]{3,8}\]\s*$/i.test(raw);
    const mutatedPrompt = hasRef
      ? raw.replace(/\[ref:[0-9a-z]{3,8}\]\s*$/i, `[ref:${salt}]`)
      : `${raw} [ref:${salt}]`;
    return { prompt: mutatedPrompt, repeatCount, mutated: true, salt };
  }
  function habit() {
    // 极速两步微缩探针（融合千面助手 v9.2 四分类防重探针池与随机盐）：不指定 write_file 工具名、不写死文件名格式（自然暴露下划线/连字符与 bash/write 偏好），
    // 通过「保存 35~45 行 HTML+SVG 微缩徽章 + 1 条终端命令核对行数/字节数 + 中文加粗要点简述」在单轮 6~10 秒内点亮全部 20 维习惯特征
    return unique('gacha:habit-prompts:v1', () => {
      const words = sampleWords(AUTOQA_WORDS, 3);
      const num = 10 + randomInt(89);
      const { scene: svgScene, salt } = probeFromPool('', true);
      const themePair = `${words[0]} / ${words[1]}`;
      const badgeTitle = `${words[0].toUpperCase()} · ${words[2].toUpperCase()} #${num} [${salt}]`;
      const step1 = pick([
        `请在工作区创建并保存一个自包含的单文件 \`.html\` 卡片（文件名自拟，需包含主题词 ${themePair}），页面展示标题「${badgeTitle}」并${svgScene}，整个 HTML 文件控制在 35～45 行以内。`,
        `请在工作区中保存一个独立的单文件 \`.html\` 微缩面板（文件名请结合主题词 ${themePair} 自拟），渲染代号「${badgeTitle}」并${svgScene}，总代码保持在 35～45 行以内。`,
        `请生成一个自包含的 \`.html\` 徽章文件保存到工作区（文件名由你根据主题词 ${themePair} 自由命名），显示标签「${badgeTitle}」并${svgScene}，全文严格控制在 35～45 行以内。`
      ]);
      const step2 = pick([
        '保存后请执行一条最简单的终端命令查看该文件的行数或字节数以确认落盘，最后用中文列出 2～3 条简短的加粗要点总结你的设计与动效实现。',
        '文件生成后请运行一条轻量终端命令核对文件大小或行数，随后在回复中用中文分 2～3 条加粗要点简述核心样式与动画细节。',
        '完成后请用一条简短的终端命令检查生成的行数与字节数，并在回复末尾用中文给出 2～3 条加粗要点说明实现亮点。'
      ]);
      return `${step1}${step2}`;
    });
  }
  function autoqaOne(qIndex = 0) {
    // 第 1 问直接发送两步微缩探针（单轮点亮 20 维代码/工具/思考/行文指纹）；第 2、3 问保留为极短追问（仅在开启 /cost 且首轮同价并列时用于差分锁定）
    if (qIndex === 0) return habit();
    return unique('gacha:autoqa-prompts:v1', () => {
      const w = sampleWords(AUTOQA_WORDS, 3);
      const n = pick(AUTOQA_NUMBERS);
      if (qIndex === 1) {
        return `请无需调用任何工具，直接用中文分 2 条简短加粗要点说明如果为「${w[0]} / ${w[1]} (${n})」卡片增加深色模式，你会如何调整配色与对比度（80 字以内）？`;
      }
      return `请无需调用任何工具，直接用一句话（50 字以内）给出「${w[0]} · ${w[2]} (${n})」状态指示器的无障碍属性建议。`;
    });
  }
  function autoqa() {
    return [autoqaOne(0), autoqaOne(1), autoqaOne(2)];
  }

  const PELICAN_I18N_POOL = [
    { lang: '中文(简)', text: '创建一个新 HTML，使用 SVG 绘制一个鹈鹕骑自行车的 2D 动画。页面中只展示自动播放、循环播放的动画，不要解释、说明文字、按钮、菜单或任何交互功能，不需要任何测试。' },
    { lang: '中文(繁)', text: '建立一個新的 HTML，使用 SVG 繪製一個鵜鶘騎自行車的 2D 動畫。頁面中只展示自動播放、循環播放的動畫，不要解釋、說明文字、按鈕、選單或任何互動功能，不需要任何測試。' },
    { lang: 'English', text: 'Create a new HTML file that uses SVG to draw a 2D animation of a pelican riding a bicycle. The page must only display the auto-playing, looping animation, with no explanations, descriptive text, buttons, menus, or any interactive features, and no tests are needed.' },
    { lang: '日本語', text: '新しいHTMLを作成し、SVGを使用してペリカンが自転車に乗っている2Dアニメーションを描画してください。ページには自動再生・ループ再生されるアニメーションのみを表示し、説明やテキスト、ボタン、メニュー、インタラクティブな機能は一切含めず、テストも不要です。' },
    { lang: '한국어', text: '새로운 HTML을 생성하고 SVG를 사용하여 펠리컨이 자전거를 타는 2D 애니메이션을 그리세요. 페이지에는 자동 재생 및 무한 반복되는 애니메이션만 표시하고, 설명이나 안내 문구, 버튼, 메뉴 또는 어떠한 상호작용 기능도 넣지 마세요. 테스트도 필요하지 않습니다.' },
    { lang: 'Français', text: 'Créez un nouveau fichier HTML utilisant SVG pour dessiner une animation 2D d\'un pélican faisant du vélo. La page doit uniquement afficher l\'animation en lecture automatique et en boucle, sans explications, texte descriptif, boutons, menus ni aucune fonctionnalité interactive, et aucun test n\'est nécessaire.' },
    { lang: 'Deutsch', text: 'Erstellen Sie eine neue HTML-Datei, die mithilfe von SVG eine 2D-Animation eines fahrradfahrenden Pelikans zeichnet. Die Seite darf nur die automatisch abspielende, in einer Endlosschleife laufende Animation anzeigen – ohne Erklärungen, Beschreibungstexte, Schaltflächen, Menüs oder interaktive Funktionen; Tests sind nicht erforderlich.' },
    { lang: 'Español', text: 'Crea un nuevo archivo HTML utilizando SVG para dibujar una animación 2D de un pelícano montando en bicicleta. La página solo debe mostrar la animación en reproducción automática y en bucle, sin explicaciones, textos descriptivos, botones, menús ni ninguna función interactiva, y no se necesita ninguna prueba.' },
    { lang: 'Русский', text: 'Создайте новый HTML-файл, использующий SVG для отрисовки 2D-анимации пеликана, едущего на велосипеде. На странице должна отображаться только автоматически воспроизводимая зацикленная анимация — без пояснений, текста, кнопок, меню или любых интерактивных элементов; никакие тесты не нужны.' },
    { lang: 'Italiano', text: 'Crea un nuovo file HTML utilizzando SVG per disegnare un\'animazione 2D di un pellicano che va in bicicletta. La pagina deve mostrare esclusivamente l\'animazione con riproduzione automatica e in loop, senza spiegazioni, testi descrittivi, pulsanti, menu o qualsiasi funzione interattiva, e non è necessario alcun test.' },
    { lang: 'Português', text: 'Crie um novo arquivo HTML usando SVG para desenhar uma animação 2D de um pelicano andando de bicicleta. A página deve exibir apenas a animação com reprodução automática e em loop, sem explicações, textos descritivos, botões, menus ou qualquer recurso interativo, e nenhum teste é necessário.' },
    { lang: 'Nederlands', text: 'Maak een nieuw HTML-bestand dat met behulp van SVG een 2D-animatie tekent van een pelikaan op een fiets. De pagina mag alleen de automatisch afspelende, herhalende animatie tonen, zonder uitleg, beschrijvende tekst, knoppen, menu\'s of enige interactieve functies, en er zijn geen tests nodig.' },
    { lang: 'Polski', text: 'Utwórz nowy plik HTML używający SVG do narysowania animacji 2D przedstawiającej pelikana jadącego na rowerze. Strona ma wyświetlać wyłącznie automatycznie odtwarzaną, zapętloną animację, bez wyjaśnień, tekstów opisowych, przycisków, menu ani żadnych funkcji interaktywnych; żadne testy nie są potrzebne.' },
    { lang: 'Türkçe', text: 'SVG kullanarak bisiklet süren bir pelikanın 2D animasyonunu çizen yeni bir HTML oluşturun. Sayfada yalnızca otomatik oynatılan ve döngüye alınan animasyon gösterilmelidir; açıklama, metin, düğme, menü veya herhangi bir etkileşimli özellik olmamalıdır ve hiçbir teste gerek yoktur.' },
    { lang: 'Tiếng Việt', text: 'Tạo một tệp HTML mới sử dụng SVG để vẽ hoạt ảnh 2D một chú bồ nông đang đạp xe. Trang chỉ hiển thị hoạt ảnh tự động phát và lặp lại liên tục, không có giải thích, văn bản mô tả, nút bấm, menu hay bất kỳ tính năng tương tác nào, và không cần bất kỳ bài kiểm tra nào.' },
    { lang: 'Bahasa Indonesia', text: 'Buat file HTML baru menggunakan SVG untuk menggambar animasi 2D burung pelikan yang sedang mengendarai sepeda. Halaman hanya boleh menampilkan animasi yang diputar otomatis dan berulang, tanpa penjelasan, teks deskripsi, tombol, menu, atau fitur interaktif apa pun, serta tidak memerlukan pengujian apa pun.' },
    { lang: 'ไทย', text: 'สร้างไฟล์ HTML ใหม่โดยใช้ SVG เพื่อวาดแอนิเมชัน 2 มิติของนกกระทุงกำลังปั่นจักรยาน ในหน้าเว็บให้แสดงเฉพาะแอนิเมชันที่เล่นอัตโนมัติและวนซ้ำเท่านั้น โดยไม่ต้องมีคำอธิบาย ข้อความ ปุ่ม เมนู หรือฟีเจอร์โต้ตอบใดๆ และไม่จำเป็นต้องมีการทดสอบใดๆ' },
    { lang: 'Svenska', text: 'Skapa en ny HTML-fil som använder SVG för att rita en 2D-animation av en pelikan som cyklar. Sidan ska endast visa den automatiskt spelande och loopande animationen, utan förklaringar, beskrivande text, knappar, menyer eller några interaktiva funktioner, och inga tester behövs.' },
    { lang: 'Čeština', text: 'Vytvořte nový soubor HTML využívající SVG k vykreslení 2D animace pelikána jedoucího na kole. Stránka musí zobrazovat pouze automaticky přehrávanou animaci ve smyčce, bez vysvětlení, popisného textu, tlačítek, nabídek nebo jakýchkoli interaktivních prvků, a nejsou potřeba žádné testy.' },
    { lang: 'Українська', text: 'Створіть новий HTML-файл, використовуючи SVG для малювання 2D-анімації пелікана, який їде на велосипеді. На сторінці має відображатися лише анімація з автовідтворенням та зацикленням, без пояснень, текстових описів, кнопок, меню чи будь-яких інтерактивних функцій, і жодні тести не потрібні.' },
    { lang: 'Română', text: 'Creați un fișier HTML nou folosind SVG pentru a desena o animație 2D cu un pelican care merge pe bicicletă. Pagina trebuie să afișeze doar animația redată automat și în buclă, fără explicații, text descriptiv, butoane, meniuri sau orice funcții interactive, și nu este nevoie de niciun test.' },
    { lang: 'Ελληνικά', text: 'Δημιουργήστε ένα νέο αρχείο HTML χρησιμοποιώντας SVG για να σχεδιάσετε ένα 2D κινούμενο σχέδιο ενός πελεκάνου που κάνει ποδήλατο. Η σελίδα πρέπει να εμφανίζει μόνο το κινούμενο σχέδιο σε αυτόματη και επαναλαμβανόμενη αναπαραγωγή, χωρίς εξηγήσεις, κείμενο, κουμπιά, μενού ή διαδραστικές λειτουργίες, και δεν χρειάζονται δοκιμές.' },
    { lang: 'العربية', text: 'أنشئ ملف HTML جديدًا يستخدم SVG لرسم رسوم متحركة ثنائية الأبعاد لبجعة تقود دراجة هوائية. يجب أن تعرض الصفحة فقط الرسوم المتحركة التي تعمل تلقائيًا وبشكل متكرر، بدون أي شرح أو نصوص توضيحية أو أزرار أو قوائم أو أي ميزات تفاعلية، ولا حاجة لأي اختبارات.' },
    { lang: 'हिन्दी', text: 'एक नया HTML बनाएं जो साइकिल चलाते हुए पेलिकन का 2D एनीमेशन बनाने के लिए SVG का उपयोग करता हो। पेज में केवल ऑटो-प्ले और लूप होने वाला एनीमेशन ही दिखना चाहिए, कोई व्याख्या, विवरण पाठ, बटन, मेनू या कोई इंटरैक्टिव फ़ीचर नहीं होना चाहिए, और किसी परीक्षण की आवश्यकता नहीं है।' },
  ];

  function makePelicanSuffix11D6L() {
    let digits = String(1 + randomInt(9));
    for (let i = 0; i < 10; i++) digits += String(randomInt(10));
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let letters = "";
    for (let i = 0; i < 6; i++) letters += alpha[randomInt(alpha.length)];
    return digits + letters;
  }

  function buildRandomPelicanTestPrompt() {
    const HKEY = "gacha:pelican-i18n-history:v1";
    let hist = Store.get(HKEY, []);
    if (!Array.isArray(hist)) hist = [];
    const lastLang = hist.length ? hist[hist.length - 1].lang : "";
    const cands = PELICAN_I18N_POOL.filter(x => x.lang !== lastLang);
    const chosen = pick(cands.length ? cands : PELICAN_I18N_POOL);
    const usedSuffixes = new Set(hist.map(h => h.suffix));
    let suffix = makePelicanSuffix11D6L();
    for (let g = 0; g < 15 && usedSuffixes.has(suffix); g++) suffix = makePelicanSuffix11D6L();
    const prompt = chosen.text + " " + suffix;
    hist.push({ lang: chosen.lang, suffix, at: Date.now() });
    if (hist.length > 60) hist = hist.slice(-60);
    Store.set(HKEY, hist);
    return { prompt, lang: chosen.lang, suffix };
  }

  const DIVERSE_MICRO_PROBES_V13 = [
    "帮我把下面这份办公文具领用记录按数量从少到多排成三行：\n签字笔 24 支、记事本 9 本、长尾夹 15 盒",
    "请把这三项厨房食材按克重从轻到重分成三行写出来：\n面粉 450 克、黄油 85 克、细砂糖 160 克",
    "帮我将以下三条快递货架编号按包裹数从多到少列成三行：\nA区货架 31 件、B区货架 12 件、C区货架 48 件",
    "请把下面三本借阅图书按页数从厚到薄排成三行：\n历史年表 410 页、植物图鉴 185 页、天文入门 290 页",
    "帮我把这三杯饮品的制作温度从低到高排成三行：\n冷萃咖啡 4℃、温牛奶 52℃、红茶拿铁 78℃",
    "请把下面三段慢跑打卡记录按里程从短到长列成三行：\n周二晨跑 4.2 公里、周四夜跑 6.8 公里、周六公园跑 3.5 公里",
    "帮我将三盆阳台绿植的浇水间隔按天数从短到长排成三行：\n薄荷 2 天、虎皮兰 14 天、绿萝 5 天",
    "请把这三个会议室的座位容量按人数从少到多分成三行：\n兰花厅 8 人、松柏厅 26 人、竹林厅 14 人",
    "帮我把以下三趟城际班车的发车耗时按分钟数从短到长排成三行：\n早班车 42 分钟、午间车 29 分钟、晚班车 55 分钟",
    "请将这三款充电宝的额定容量按毫安时从小到大列成三行：\n便携款 5000mAh、旅行款 20000mAh、日常款 10000mAh",
    "帮我把下面三箱水果的净重按斤数从重到轻排成三行：\n脐橙 18 斤、脆柿 9 斤、香梨 14 斤",
    "请把这三张水电账单的金额按数字从低到高列成三行：\n水费 46 元、燃气费 118 元、电费 235 元"
  ];

  const PROBE_POOL_VERSION = "probe-pool-v1";
  const PROBE_POOL_STORAGE = "arena-agent-billing:probe-pool:v1";
  const PROBE_POOL_LOG_LIMIT = 50;
  const PROBE_POOL_SUMMARY_MAX = 40;
  const PROBE_POOL = [
    { id: "P01", first: "帮我把下面这段小组例会的记录收成三条要点，别加自己的评论。", material: "例会记录：\n值班表、报销单、团建时间", ask: "请用 50 到 100 个字回答：写成三条要点，一行一条。" },
    { id: "P02", first: "手边有一份读书清单，麻烦按页数从少到多帮我排一下。", material: "《城南旧事》218 页\n《活着》156 页\n《围城》302 页", ask: "用 50 到 100 个字回答：按页数从少到多，一行一本。" },
    { id: "P03", first: "这份租车结算单的信息有点散，我想先把关键字段抠出来。", material: "租车单：车型 朗逸；取车 10 月 3 日；还车 10 月 6 日；押金 500", ask: "请用 50 到 100 个字回答：字段名与取值一行一条。" },
    { id: "P04", first: "数一下下面这段场地说明里“备用”这个词出现了几次，顺便标出所在句子。", material: "场地说明：备用电源 2 处，备用桌椅 4 套，其余物资已清点，备用区暂不开放。", ask: "用 50 到 100 个字回答：先给次数，再说分别在哪一句。" },
    { id: "P05", first: "几个维修工单的日期顺序乱了，你能替我理一下先后吗？", material: "工单：3 月 8 日 换灯；3 月 2 日 修门；3 月 15 日 通下水", ask: "请用 50 到 100 个字回答：按日期从早到晚排，一行一条。" },
    { id: "P06", first: "这周的天气播报稿太长，帮我压成三句话。", material: "播报稿：\n周三晴 12–20℃；周四阴有小雨；周五转晴", ask: "用 50 到 100 个字回答：压成三句话，别加评论。" },
    { id: "P07", first: "我不太确定公里和英里怎么换算，下面这组里程你能不能统一成公里？", material: "里程：\n3.5 英里、8 英里、12.4 英里", ask: "请用 50 到 100 个字回答：全部换成公里，保留一位小数。" },
    { id: "P08", first: "两份物资申领单合在一起以后有重复，帮我判断哪些是重复项。", material: "甲单：帐篷 2、睡袋 4\n乙单：睡袋 4、手电 3", ask: "用 50 到 100 个字回答：先列重复项，再列只在一边的。" },
    { id: "P09", first: "有个包裹面单的内容我抄下来了，需要你拆成字段。", material: "面单：收件人 李；电话 1380000；地址 光明路 7 号；到付", ask: "请用 50 到 100 个字回答：拆成字段，一行一条。" },
    { id: "P10", first: "冰箱里剩下的东西我列了一下，想按类别归归拢。", material: "冰箱：鸡蛋 6 个、酸奶 2 盒\n冷藏室还有半棵白菜、一块豆腐", ask: "用 50 到 100 个字回答：按类别归拢，每类一行。" },
    { id: "P11", first: "说明书这段我读着费劲，你替我提炼要点。", material: "说明书：首次使用先空烧 5 分钟；每次用完擦干；勿浸水。", ask: "请用 50 到 100 个字回答：提炼成三条要点。" },
    { id: "P12", first: "排班表在下面，请把它改成一人一行的清单。", material: "排班：周一 早班 王、晚班 李\n周二 早班 赵", ask: "用 50 到 100 个字回答：改成一人一行，写清班次。" },
    { id: "P13", first: "仓库盘点的小票在这儿，帮我算一下总数。", material: "盘点：螺丝 120 个、垫片 3 包共 84 个、铰链 16 个", ask: "请用 50 到 100 个字回答：先给总数，再按品名列。" },
    { id: "P14", first: "昨晚那场球我看了一半，这段赛况帮我缩成几句。", material: "赛况：上半场 1:0；下半场连丢两球，终场 1:2。", ask: "用 50 到 100 个字回答：缩成两三句，说清比分。" },
    { id: "P15", first: "烤箱温度我拿不准，这里有一组摄氏读数，换算成华氏。", material: "烤箱：180℃、200℃、220℃", ask: "请用 50 到 100 个字回答：全部换成华氏，一行一个。" },
    { id: "P16", first: "两份书单看着差不多，帮我看看有没有重复的条目。", material: "书单甲：《活着》《围城》\n书单乙：《围城》《边城》", ask: "用 50 到 100 个字回答：指出重复条目，再说差异。" },
    { id: "P17", first: "课程表截图上的内容我打成了文字，需要抽出关键字段。", material: "课程：高等数学 周一 3-4 节 教三 201；英语 周三 1-2 节 教一 105", ask: "请用 50 到 100 个字回答：抽出课程、时间、地点三列。" },
    { id: "P18", first: "待办事项堆了一屏，麻烦按紧急程度重新排。", material: "待办：交报表（急）截止 10/12\n订机票（中）10/20\n整理照片（缓）11/05", ask: "用 50 到 100 个字回答：按紧急程度排，一行一条。" },
    { id: "P19", first: "实验记录写得比较碎，请归纳成一段简短说明。", material: "实验记录：\n第一批 3 次失败；第二批 1 次；第三批 2 次", ask: "用 50 到 100 个字回答：写成一段简短说明，含次数。" },
    { id: "P20", first: "报价单上有几个方案，按价格从低到高列一下。", material: "方案 A 报价 3200；方案 B 报价 2750；方案 C 报价 4100", ask: "请用 50 到 100 个字回答：按价格从低到高，一行一个。" },
    { id: "P21", first: "配方里用的是盎司，我只有克秤，帮我把单位统一。", material: "配方：黄油 4 盎司、糖 2 盎司", ask: "用 50 到 100 个字回答：换成克，一行一条。" },
    { id: "P22", first: "两个部门的名单要合并，注意重名与兼任的情况。", material: "技术部：张伟、李娜\n市场部：张伟（兼）、王强", ask: "请用 50 到 100 个字回答：合并名单，标出重名与兼任。" },
    { id: "P23", first: "出差行程的文字版在下面，请把车次和住宿信息抽出来。", material: "行程：G1234 次 10:05 开；住 如家 两晚；返程 D567 次", ask: "用 50 到 100 个字回答：抽车次与住宿，一行一条。" },
    { id: "P24", first: "几个会议邀请时间打架了，帮我排个先后并指出来。", material: "会议：9:30 评审；9:00 站会；11:00 面试", ask: "请用 50 到 100 个字回答：排出先后并指出冲突。" },
    { id: "P25", first: "这段社区活动的通稿有点长，缩成一小段。", material: "活动通稿：周六上午义诊，下午亲子手工，晚饭后有露天电影。", ask: "用 50 到 100 个字回答：缩成一小段，保留时间。" },
    { id: "P26", first: "候选方案各有评分，请按总分排序并给出前两名。", material: "评分：甲 82、乙 91、丙 76、丁 88", ask: "请用 50 到 100 个字回答：按总分排，给前两名。" },
    { id: "P27", first: "这页流水账里有若干笔支出，帮我按类别汇总笔数。", material: "流水：餐费 3 笔、交通 2 笔、打印 1 笔、餐费补记 1 笔", ask: "用 50 到 100 个字回答：按类别给笔数，一行一类。" },
    { id: "P28", first: "饮料配方写的是加仑，我想换成升。", material: "配方：加水 2 加仑、糖浆半加仑", ask: "请用 50 到 100 个字回答：换成升，保留一位小数。" },
    { id: "P29", first: "词条表里有些说法其实是同一个意思，帮我判断哪些可以合并。", material: "词条：\n“充电宝”“移动电源”\n“截图”“截屏”", ask: "用 50 到 100 个字回答：指出可合并的说法。" },
    { id: "P30", first: "设备台账抄在下面，请把编号、位置、状态三个字段分开列。", material: "台账：A-12 三楼主控 正常；B-07 地下泵房 待修", ask: "请用 50 到 100 个字回答：编号、位置、状态分三列。" },
    { id: "P31", first: "客服工单的原始描述在下面，帮我归类成一句话结论。", material: "工单原文：用户说 App 打不开，重启后仍旧，怀疑版本旧。", ask: "用 50 到 100 个字回答：归成一句话结论，再列可能原因。" },
    { id: "P32", first: "这份内部花名册的顺序是乱的，请按部门分组再按入职年份排。", material: "花名册：市场部 2019 入职 3 人；技术部 2021 入职 2 人", ask: "请用 50 到 100 个字回答：按部门分组、组内按年份排。" },
    { id: "P33", first: "药箱好久没清了，你帮我归归类。", material: "药箱：感冒药 2 盒（过期）、创可贴 1 包、退烧药 1 瓶", ask: "用 50 到 100 个字回答：按类别归拢，标出过期的。" },
    { id: "P34", first: "民宿退房前我挨屋转了一圈，东西有点乱。", material: "退房清点：\n主卧 台灯一个；厨房 锅铲两把；阳台 晾衣架", ask: "请用 50 到 100 个字回答：按房间归类，一行一间。" },
    { id: "P35", first: "合唱团群里刷了一屏排练安排，", material: "排练单：8日晚7点合练，12日下午2点走台；\n19日全天外地演出，6点半校门集合。", ask: "请用 50 到 100 个字回答：按时间归纳成要点，一行一条，写日期和事项。" },
    { id: "P36", first: "花店这周的进货条子攒了一沓，", material: "花店本周进货：红玫瑰60支、白玫瑰30支；\n多肉12盆、琴叶榕3盆；缎带3卷。", ask: "请用 50 到 100 个字回答：按品类归纳，一行一类，只写品名和数量。" },
    { id: "P37", first: "二手相机那笔交易我记了张单子，", material: "相机转让备忘：机身快门2万次，卡口有浅划痕；\n35mm定焦镜片一粒灰，附两块电池。", ask: "请用 50 到 100 个字回答：归纳成三行，行首写类别，瑕疵要留着。" },
    { id: "P38", first: "校运会借器材的条子我收了一叠，", material: "器材借还登记：起跑器4副缺2颗钉；接力棒8根，\n1根有磕痕；跳高垫2块，绑带断过。", ask: "请用 50 到 100 个字回答：归纳成一种器材一行，写名称、数量和借的班级。" },
    { id: "P39", first: "茶馆那几张会员卡规则写得太绕，", material: "储值卡充300送30，赠额不能单用；10次卡180元，不含茶点；\n家庭卡可登记3人。", ask: "请用 50 到 100 个字回答：一种卡归纳一行，写成「卡种：能用的范围」。" },
    { id: "P40", first: "宠物医院复诊完塞给我一张交代单，", material: "复诊交代：早晚饭后各半片，吐了隔2小时补；\n7天后复查血常规，来前4小时别喂食。", ask: "请用 50 到 100 个字回答：按用药、饮食、观察、复诊归纳，各写一行。" },
    { id: "P41", first: "快递驿站的取件通知堆了一屏，", material: "驿站到件：\n4821 昨15:18；0973 今09:05；7208 上周六12:30。", ask: "请用 50 到 100 个字回答：按到件时间排，一行一件，写尾数和时刻。" },
    { id: "P42", first: "甜品店门口的取号牌我拍下来了，", material: "取号：A017 13:20；B003 13:05；A012 13:12。", ask: "请用 50 到 100 个字回答：按取号时间从早到晚，只写号码和时间。" },
    { id: "P43", first: "图书馆书架上那几本书的页数我抄了，", material: "页数抄录：\n《山南旧事》312页；《桥下人家》194页；《河湾手记》406页。", ask: "请用 50 到 100 个字回答：按页数从少到多，一行一本，写书名和页数。" },
    { id: "P44", first: "青旅前台那张房价表我看不清，", material: "房价（平日）：六人间68、四人间88、双人间158、单人间128、帐篷位45。", ask: "请用 50 到 100 个字回答：按平日价从低到高，一行一种房型。" },
    { id: "P45", first: "登山队那份打卡表上的海拔我抄下来了，", material: "打卡点海拔：山门320米、凉亭760米、碎石坡1080米、垭口1450米。", ask: "请用 50 到 100 个字回答：按海拔从低到高，一行一个点，写名称和海拔。" },
    { id: "P46", first: "摄影比赛那批评分我整理不动了，", material: "初评：雨巷86/82/88，晨渡79/91/84，旧站93/87/90。", ask: "请用 50 到 100 个字回答：按平均分从高到低排，写作品名和分数。" },
    { id: "P47", first: "一箱老唱片的发行年份我记混了，", material: "唱片年份：南风夜曲1979、夏夜小调1983、河畔三重奏1971、远山回声1966。", ask: "请用 50 到 100 个字回答：按发行年份从早到晚，只写名称和年份。" },
    { id: "P48", first: "装修队给的工序表前后顺序乱，", material: "工序工期：拆旧2天、水电5天、防水3天、贴砖6天、木工4天、油漆7天。", ask: "请用 50 到 100 个字回答：按天数从少到多，一行一道工序。" },
    { id: "P49", first: "旧手机拿去以旧换新，报价我记了几条。", material: "检测记录：屏幕浅划痕；电池健康度78%，扣50；\n扬声器有杂音；电池官方换过。", ask: "请用 50 到 100 个字回答：按外观、电池、功能归并，一块一行，别写金额。" },
    { id: "P50", first: "露营前我把要带的东西列了一堆。", material: "露营清单：帐篷1顶、地钉12根、睡袋2个；\n炉子1个、气罐2瓶、头灯2个（1个不亮）。", ask: "请用 50 到 100 个字回答：按类别归并，一块一行，坏的必须标出来。" },
    { id: "P51", first: "篮球队体测成绩单在我手上，", material: "折返跑成绩：陈熙11.2秒、周牧12.8秒、林阔10.9秒、赵桓13.4秒。", ask: "请用 50 到 100 个字回答：按折返跑用时从少到多，只写姓名和用时。" },
    { id: "P52", first: "面包房的出炉时刻表贴歪了，", material: "出炉时刻：吐司6:50、法棍7:10、可颂7:40、碱水结8:00。", ask: "请用 50 到 100 个字回答：按出炉时刻排，一行一种，写名称和时刻。" },
    { id: "P53", first: "邮票册里那张面值表我抄下来了，", material: "面值记录：纪念票8分、普通票4分、欠资票2分、小型张1元2角。", ask: "请用 50 到 100 个字回答：按面值从小到大，一行一枚，写名称和面值。" },
    { id: "P54", first: "修车厂的工位排期我看花眼了，", material: "工位空档：1号9点到11点、2号8点半到10点、4号7点50到9点10。", ask: "请用 50 到 100 个字回答：按空闲开始时刻排，只写工位号和时段。" },
    { id: "P55", first: "种子袋上写的发芽天数我没记全，", material: "发芽天数：樱桃萝卜5-7天、小白菜3-5天、生菜7-10天、香菜10-15天。", ask: "请用 50 到 100 个字回答：按发芽天数从短到长，写菜名和天数。" },
    { id: "P56", first: "门诊预约那张单子我照着抄了下来，帮我抠字段。", material: "门诊预约：周敏，34岁，呼吸内科；\n就诊11月14日9:20，序号A36。", ask: "请用 50 到 100 个字回答：一行一个字段，写成「字段名＝取值」。" },
    { id: "P57", first: "宠物店寄养登记那张卡片，内容我要整理成字段。", material: "寄养卡：豆包，比熊，公，2岁半；主人陈立；\n入店12月3日，押金500，怕打雷。", ask: "请用 50 到 100 个字回答：每行一个字段，写成「字段名：取值」。" },
    { id: "P58", first: "婚宴回执的那一叠小纸条，帮我把信息归成字段。", material: "回执：李建国一家3口，出席，想坐主桌；\n赵小雨带1位同伴，吃素；孙老师要靠窗那桌。", ask: "请用 50 到 100 个字回答：一行一位客人，分「姓名／人数／备注」三列。" },
    { id: "P59", first: "农机租赁那份合同我摘了几行，需要拆成字段。", material: "租赁摘录：承租刘庆丰；机具久保田收割机；\n租期9月20日到10月5日，日租240元。", ask: "请用 50 到 100 个字回答：只列字段名和取值，一行一条，缺失写未填。" },
    { id: "P60", first: "琴行那张维修单我看不太懂，帮我抽出字段来。", material: "维修单：客户许安然；立式钢琴两键回弹慢；\n送修11月8日；调律180元，换毡垫30元。", ask: "请用 50 到 100 个字回答：输出两列，左边字段名右边取值，缺的写未填。" },
    { id: "P61", first: "茶站收茶的那张单据，帮我把字段抄明白。", material: "收购单：农户吴有田，上坑组；4月17日；\n毛重38斤，扣杂后按35斤；单价12元。", ask: "请用 50 到 100 个字回答：一行一个字段，用冒号分隔，没提的写未填。" },
    { id: "P62", first: "看房那天的记录我随手写了几行，需要提字段。", material: "看房记录：临江路9号院两室一厅，租2300；\n地铁口老楼一室一厅，租1900含物业。", ask: "请用 50 到 100 个字回答：先写房号，再写字段名和取值，缺的写未填。" },
    { id: "P63", first: "驾校那份学员档案，我想把里面的字段理出来。", material: "学员档案：郭春燕；报考C1，报名3月9日；\n科一94分，科二补考一次，教练是马师傅。", ask: "请用 50 到 100 个字回答：只输出字段与取值，一行一条，没填的写未填。" },
    { id: "P64", first: "中药房给的那张方子抄件，帮我拆成字段。", material: "药方抄件：田素芬；每日一剂，水煎两次；\n黄芪30克、当归12克，共12味，三味先煎。", ask: "请用 50 到 100 个字回答：一行一味药，写成「药名／用量」，说明也要。" },
    { id: "P65", first: "影楼那份拍摄订单，麻烦把关键字段挑出来。", material: "拍摄订单：客户郝佳，婚纱照11月2日拍；\n服装3套，定金1000，尾款取片时付清。", ask: "请用 50 到 100 个字回答：按「字段名：取值」一行一条，空栏写未填。" },
    { id: "P66", first: "民宿那本入住登记册，我想理成一列字段。", material: "登记册：谭姓住2晚；一家4口要带阳台房；\n有客人只留名和车牌后3位；押金200。", ask: "请用 50 到 100 个字回答：一行一位客人，列出登记到的字段，没写清的写未填。" },
    { id: "P67", first: "苗圃那张采购单我拍了照抄下来，帮我提字段。", material: "采购单：香樟胸径8厘米60株；红叶石楠高50厘米300株；\n草皮卷30块，货到付七成。", ask: "请用 50 到 100 个字回答：一行一项，格式「品名｜规格｜数量」，缺的写未填。" },
    { id: "P68", first: "车站失物登记那几行字，帮我分成字段。", material: "失物登记：黑色双肩包，周一早高峰拾于第二节车厢\n暂存值班室，已联系失主，人未到场", ask: "请用 50 到 100 个字回答：一行一件，写「物品／时间／状态」。" },
    { id: "P69", first: "菜市场这本摊位费流水，帮我按类别数一下。", material: "摊位费流水：蔬菜 4 笔×30 元，水果 3 笔×35 元\n猪肉 5 笔×50 元，水产 2 笔×45 元", ask: "请用 50 到 100 个字回答：一行一类，写「类别／笔数／金额」。" },
    { id: "P70", first: "图书馆还书记录里我标了一堆，帮我数一下。", material: "还书登记：十月八日 3 本，九日 5 本\n十日 2 本，十二日 7 本，逾期 1 本", ask: "请用 50 到 100 个字回答：一行一天，只写日期和逾期本数。" },
    { id: "P71", first: "花园那本种植清单，帮我数数各类有多少。", material: "花坛清单：月季 6 株、绣球 4 株\n薰衣草 10 株成活 7 株，郁金香球 40 个", ask: "请用 50 到 100 个字回答：一行一种，写「花名／株数」。" },
    { id: "P72", first: "驿站那份入库明细，帮我按公司统计件数。", material: "入库明细：通达 40 件，顺风 12 件\n京邦 8 件，极兔 15 件，京东 9 件", ask: "请用 50 到 100 个字回答：一行一家，写「公司／件数」。" },
    { id: "P73", first: "食堂这几天的采购记了几页，帮我算个数。", material: "食堂采购：周一白菜 40 斤、土豆 30 斤\n周二白菜 35 斤、豆腐 15 斤、鸡蛋 25 斤", ask: "请用 50 到 100 个字回答：一行一天，写「日期／斤数」。" },
    { id: "P74", first: "幼儿园点名册那几页，帮我数出勤人数。", material: "点名册：周一实到 24、请假 3\n周二实到 26、请假 1；周三实到 21", ask: "请用 50 到 100 个字回答：一行一天，写「实到／请假」。" },
    { id: "P75", first: "志愿者签到那几张表，帮我统计一下人次。", material: "志愿签到：周六上午 19 人，下午 14 人\n周日上午 22 人，下午 17 人", ask: "请用 50 到 100 个字回答：一行一场，写「场次／人次」。" },
    { id: "P76", first: "洗衣店那本收衣登记，帮我数一下件数。", material: "收衣单：衬衫 3 件，西裤 2 条\n床单 2 条，大衣 1 件，裤子 3 条", ask: "请用 50 到 100 个字回答：一行一类，写「品名／件数」。" },
    { id: "P77", first: "充电桩那页运行记录，帮我数故障次数。", material: "充电桩一号正常，二号上午故障 1 次\n四号下午故障 2 次，五号整晚离线", ask: "请用 50 到 100 个字回答：一行一台，写「桩号／故障次数」。" },
    { id: "P78", first: "陶艺工坊那本窑位记录，帮我数出总数。", material: "窑位记录：素烧杯 8 只、碗 5 只\n釉烧杯 7 只、盘 4 只、小摆件 5 件", ask: "请用 50 到 100 个字回答：一行一批，写「批次／件数」。" },
    { id: "P79", first: "老家院墙那段尺寸单你帮我看看", material: "西厢房外墙 12.5 英尺，门框上沿 6.75 英尺\n后院梯子横档 4.2 英尺", ask: "请用 50 到 100 个字回答：一行一条，写成「名目→米数」。" },
    { id: "P80", first: "楼上鱼缸那套管件尺寸我抄下来了", material: "鱼缸玻璃 0.47 英寸，进水管外径 1.25 英寸\n灯架横臂 11.8 英寸", ask: "请用 50 到 100 个字回答：一行一条，只写厘米数值。" },
    { id: "P81", first: "院里那家拳馆的装备单子你理理", material: "拳馆装备：大沙袋 120 磅，速度球 15 磅\n壶铃 18 磅，地垫 33 磅", ask: "请用 50 到 100 个字回答：一行一条，写成「器材→千克」。" },
    { id: "P82", first: "船厂订帆布的清单搁我桌上了", material: "帆布清单：主帆 38 码，防雨罩 26 码\n舱盖蒙布 5.5 码", ask: "请用 50 到 100 个字回答：一行一条，项目后跟米数。" },
    { id: "P83", first: "山脚那间库房的面积表你看得懂吗", material: "库房面积表：主仓 2450 平方英尺\n副仓 980，装卸平台 620", ask: "请用 50 到 100 个字回答：一行一条，写成「区域→平方米」。" },
    { id: "P84", first: "车队长途那条线的限速牌我记了一路", material: "限速牌：出城 45 迈，弯道 35 迈\n隧道 50 迈，大桥 55 迈", ask: "请用 50 到 100 个字回答：一行一条，单位用米每秒。" },
    { id: "P85", first: "库房那几只储罐的容积表给你", material: "储罐容积：一号 32.5 立方米\n二号 31.9，消防水罐 120 立方米", ask: "请用 50 到 100 个字回答：一行一条，写成「罐体→立方英尺」。" },
    { id: "P86", first: "花园那几瓶营养液的配比你看看", material: "营养液配比：开花肥 2 品脱\n生根粉 3 品脱，除虫乳油 0.4 品脱", ask: "请用 50 到 100 个字回答：一行一条，只写毫升数值。" },
    { id: "P87", first: "田里那几块地的面积我记了个大概", material: "地块面积：东大片 12 亩，西洼地 8.5 亩\n南坡 4.2 亩，秧田 1.6 亩", ask: "请用 50 到 100 个字回答：一行一条，写成「地块→平方米」。" },
    { id: "P88", first: "灯杆那批电表读数你帮我转一下", material: "电表读数：东环路 2140 千瓦时\n公园步道 3020，桥下 640 千瓦时", ask: "请用 50 到 100 个字回答：一行一条，单位用兆焦。" },
    { id: "P89", first: "厨房墙上那张能量表你给看看", material: "能量表：红烧鸡腿 320 千卡\n米饭 230 千卡，紫菜汤 60 千卡", ask: "请用 50 到 100 个字回答：一行一条，写成「菜名→千焦」。" },
    { id: "P90", first: "茶厂那台烘干机的耗热记录在这", material: "烘干机耗热：萎凋槽 24 万英热单位\n初烘 32 万，足烘 41 万英热单位", ask: "请用 50 到 100 个字回答：一行一条，工序后跟千焦数。" },
    { id: "P91", first: "港区拖轮那条日志你帮我换算下", material: "拖轮日志：出海航道 9 节，进港 6 节\n靠泊 3 节，备用待命 11 节", ask: "请用 50 到 100 个字回答：一行一条，单位用公里每小时。" },
    { id: "P92", first: "珠宝店那几颗裸石的重量单给你", material: "裸石重量：主石 1.25 克拉\n配石 6 颗每颗 0.18 克拉，吊坠 2.1 克拉", ask: "请用 50 到 100 个字回答：一行一条，写成「石料→克」。" },
    { id: "P93", first: "柜子里翻出张老地契上面数你认认", material: "老地契：北坡林地 46 英亩\n南坡草场 18.5 英亩，水塘 7.2 英亩", ask: "请用 50 到 100 个字回答：一行一条，写成「地块→公顷」。" },
    { id: "P94", first: "铺子里那卷海图上的航程我抄了一段", material: "海图航程：码头到浮标 3.4 海里\n东礁灯塔 12.6 海里，环岛 33 海里", ask: "请用 50 到 100 个字回答：一行一条，只写航段和公里数。" },
    { id: "P95", first: "桥下那批报修单里的加急件你数数", material: "报修单：1 号伸缩缝加急，2 号护栏加急\n3 号路灯普通，4 号支座垫石加急", ask: "请用 50 到 100 个字回答：一行一条，写「编号／是否加急」。" },
    { id: "P96", first: "账上这页缴费记录你帮我归类统计", material: "缴费记录：物业费 1280 元\n公共电费 316 元、288 元，水管维修 780 元", ask: "请用 50 到 100 个字回答：一行一类，写「项目／笔数／合计」。" },
    { id: "P97", first: "蜂场那本检查记录你帮我统计下", material: "蜂箱检查：1 号新王，3 号缺王\n6 号缺王，8 号老王", ask: "请用 50 到 100 个字回答：一行一类，写「类型／箱数」。" },
    { id: "P98", first: "出苗单上每块的株数我数不清，你帮我合计一下。", material: "出苗单：香樟 1200 株、桂花 860 株\n杜鹃 640 株、女贞 1750 株", ask: "请用 50 到 100 个字回答：一行一种，写「品种／株数」。" },
    { id: "P99", first: "塔吊那几页班次记录我看着头晕", material: "塔吊班次：早班停机 25 分钟\n中班无停机，晚班停机 40 分钟", ask: "请用 50 到 100 个字回答：一行一班，写「班次／原因／时长」。" },
    { id: "P100", first: "锅贴铺那张订货单你帮我算算", material: "锅贴订货：鲜肉 30 份，素三鲜 18 份\n虾仁 12 份，小米粥 40 份", ask: "请用 50 到 100 个字回答：一行一类，写「品类／份数／金额」。" },
  ];

  function probePoolText(entry) { return entry.first + "\n\n" + entry.material + "\n\n" + entry.ask; }
  function probePoolFirstSentence(entry) { return String(entry.first || "").trim(); }
  function probePoolHash(list) {
    let hash = 0x811c9dc5;
    for (const entry of list) {
      const text = entry.id + "\u0000" + entry.first + "\u0000" + entry.material + "\u0000" + entry.ask + "\u0001";
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
    return "fnv1a32:" + hash.toString(16).padStart(8, "0");
  }
  function probePoolFind(id) { return PROBE_POOL.find(e => e.id === id) || null; }
  function probePoolUsedIds(store) {
    const kept = new Set((store?.used || []).filter(id => !!probePoolFind(id)));
    return PROBE_POOL.filter(e => kept.has(e.id)).map(e => e.id);
  }
  function probePoolReadStore() {
    const raw = Store.get(PROBE_POOL_STORAGE, null);
    const parsed = (raw && typeof raw === "object") ? raw : {};
    const used = Array.isArray(parsed.used) ? parsed.used.slice() : [];
    const normUsed = probePoolUsedIds({ used });
    const cycle = Number.isFinite(Number(parsed.cycle)) && Number(parsed.cycle) >= 1 ? Math.floor(Number(parsed.cycle)) : 1;
    const usedTotal = Number.isFinite(Number(parsed.usedTotal)) && Number(parsed.usedTotal) >= 0 ? Math.floor(Number(parsed.usedTotal)) : normUsed.length;
    return {
      cycle,
      used: normUsed,
      usedTotal,
      last: (parsed.last && typeof parsed.last === "object") ? { id: String(parsed.last.id || ""), at: Number(parsed.last.at) || 0 } : null,
      log: Array.isArray(parsed.log) ? parsed.log.slice(-PROBE_POOL_LOG_LIMIT) : [],
    };
  }
  function probePoolWriteStore(store) {
    Store.set(PROBE_POOL_STORAGE, {
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      cycle: Number(store.cycle) || 1,
      used: (store.used || []).slice(),
      usedTotal: Number(store.usedTotal) || 0,
      last: store.last || null,
      log: (store.log || []).slice(-PROBE_POOL_LOG_LIMIT),
    });
  }
  function probePoolNext(usedIds, lastId) {
    const used = new Set(usedIds || []);
    const remaining = PROBE_POOL.filter(e => !used.has(e.id));
    if (remaining.length) return remaining[0];
    const fresh = PROBE_POOL.filter(e => e.id !== lastId);
    return fresh[0] || PROBE_POOL[0] || null;
  }
  function probePoolInfo() {
    const store = probePoolReadStore();
    const used = probePoolUsedIds(store);
    const total = PROBE_POOL.length;
    const lastId = store.last ? store.last.id : null;
    const next = probePoolNext(used, lastId);
    const usedTotal = Math.max(Number(store.usedTotal) || 0, used.length);
    return {
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      total,
      used: used.length,
      usedInCycle: used.length,
      remaining: total - used.length,
      usedTotal,
      cycle: Number(store.cycle) || 1,
      next: next ? { id: next.id, firstSentence: probePoolFirstSentence(next) } : null,
    };
  }
  function probePoolDraw() {
    const total = PROBE_POOL.length;
    if (!total) return null;
    const store = probePoolReadStore();
    const used = probePoolUsedIds(store);
    const usedSet = new Set(used);
    const previousId = store.last ? store.last.id : null;
    let cycle = Number(store.cycle) || 1;
    let usedTotal = Math.max(Number(store.usedTotal) || 0, used.length);
    let candidates = PROBE_POOL.filter(e => !usedSet.has(e.id));
    if (!candidates.length) {
      cycle += 1;
      used.length = 0;
      candidates = PROBE_POOL.filter(e => e.id !== previousId);
      if (!candidates.length) candidates = PROBE_POOL.slice();
    }
    const entry = candidates[randomInt(candidates.length)];
    const text = probePoolText(entry);
    const nextUsed = used.concat([entry.id]);
    usedTotal += 1;
    const at = Date.now();
    const record = {
      at,
      id: entry.id,
      firstSentence: probePoolFirstSentence(entry),
      text,
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      cycle,
      used: nextUsed.length,
      usedTotal,
      remaining: PROBE_POOL.length - nextUsed.length,
    };
    store.cycle = cycle;
    store.used = probePoolUsedIds({ used: nextUsed });
    store.usedTotal = usedTotal;
    store.last = { id: entry.id, at };
    store.log = (store.log || []).concat([record]).slice(-PROBE_POOL_LOG_LIMIT);
    probePoolWriteStore(store);
    return { id: entry.id, firstSentence: record.firstSentence, text, cycle, usedTotal };
  }
  function probePoolReset() {
    const store = probePoolReadStore();
    store.cycle = 1; store.used = []; store.usedTotal = 0; store.last = null;
    probePoolWriteStore(store);
    return probePoolInfo();
  }
  function probePoolSnapshot() {
    return PROBE_POOL.map(e => ({ id: e.id, firstSentence: probePoolFirstSentence(e), material: e.material, ask: e.ask, text: probePoolText(e) }));
  }
  function probePoolLast() {
    const last = probePoolReadStore().last;
    const entry = last ? probePoolFind(last.id) : null;
    return entry ? { id: entry.id, firstSentence: probePoolFirstSentence(entry), at: Number(last.at) || 0 } : null;
  }
  function probePoolLog() { return probePoolReadStore().log.map(r => ({ ...r })); }
  function probePoolAttach(patch) {
    if (!patch || typeof patch !== "object") return null;
    const store = probePoolReadStore();
    if (!store.log.length) return null;
    const idx = store.log.length - 1;
    store.log[idx] = { ...store.log[idx], ...patch };
    probePoolWriteStore(store);
    return { ...store.log[idx] };
  }
  function probePoolExhausted() { return PROBE_POOL.length === 0; }
  function probePoolSummary(sentence) {
    const text = String(sentence || "").replace(/\s+/g, " ").trim();
    const chars = [...text];
    return chars.length <= PROBE_POOL_SUMMARY_MAX ? text : chars.slice(0, PROBE_POOL_SUMMARY_MAX - 1).join("") + "…";
  }
  function probePoolLabel(id) {
    const last = probePoolLast();
    const targetId = id || (last && last.id) || null;
    const entry = targetId ? probePoolFind(targetId) : probePoolNext(probePoolUsedIds(probePoolReadStore()), null);
    return entry ? ("探针 " + entry.id + " · " + probePoolSummary(entry.first)) : "探针池不可用：池内 0 条（不会自动发送探针）";
  }
  const GachaProbePool = {
    PROBE_POOL,
    probePoolDraw,
    probePoolInfo,
    probePoolReset,
    probePoolSnapshot,
    probePoolLast,
    probePoolLog,
    probePoolExhausted,
    probePoolSummary,
    probePoolAttach,
    probePoolLabel,
  };
  try {
    if (typeof globalThis !== "undefined" && !globalThis.__arenaGachaProbePool) globalThis.__arenaGachaProbePool = GachaProbePool;
    if (typeof globalThis !== "undefined" && !globalThis.__mcpBuildRandomPelicanPrompt) globalThis.__mcpBuildRandomPelicanPrompt = buildRandomPelicanTestPrompt;
  } catch {}

  return { PROTOCOL, DEFAULT_PREFERRED, PROBE_POOL_CATEGORIES, PELICAN_I18N_POOL, DIVERSE_MICRO_PROBES_V13, PROBE_POOL, GachaProbePool, makePelicanSuffix11D6L, buildRandomPelicanTestPrompt, probeFromPool, probePoolDraw, probePoolInfo, probePoolReset, probePoolSnapshot, probePoolLast, probePoolLog, probePoolExhausted, probePoolSummary, probePoolAttach, probePoolLabel, polymorphPrompt3D, normalize, keywords, match, randomInt, challenges, svg, custom, habit, autoqa, autoqaOne };
})();
