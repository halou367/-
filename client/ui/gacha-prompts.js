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
  return { PROTOCOL, DEFAULT_PREFERRED, PROBE_POOL_CATEGORIES, probeFromPool, polymorphPrompt3D, normalize, keywords, match, randomInt, challenges, svg, custom, habit, autoqa, autoqaOne };
})();
