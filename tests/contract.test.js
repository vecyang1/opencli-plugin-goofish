import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  SCHEMA_CONTRACT, 
  generateDdl, 
  validateCandidate, 
  validateSellerReview, 
  validateOrder 
} from '../src/contract.js';

test('Contract-First Architecture & Type Safety', async (t) => {
  await t.test('SCHEMA_CONTRACT defines all required tables, views, and FTS tables', () => {
    const requiredTables = ['orders', 'favorites', 'sessions', 'messages', 'seller_reviews', 'candidates'];
    for (const tbl of requiredTables) {
      assert.ok(SCHEMA_CONTRACT.tables[tbl], `Table ${tbl} must be defined in SCHEMA_CONTRACT`);
      assert.ok(SCHEMA_CONTRACT.tables[tbl].primaryKey.length > 0, `Table ${tbl} must have primary key`);
    }

    assert.ok(SCHEMA_CONTRACT.views.candidates_view, 'candidates_view must be defined');
    assert.equal(SCHEMA_CONTRACT.fts.length, 3, 'Expected 3 FTS virtual tables');
  });

  await t.test('generateDdl produces valid SQL DDL statements matching contract', () => {
    const ddl = generateDdl();
    assert.ok(Array.isArray(ddl));
    assert.ok(ddl.length >= 10, 'Expected at least 10 DDL statements');

    const joinedDdl = ddl.join('\n\n');
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS orders'));
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS candidates'));
    assert.ok(joinedDdl.includes('CREATE TABLE IF NOT EXISTS seller_reviews'));
    assert.ok(joinedDdl.includes('CREATE VIRTUAL TABLE IF NOT EXISTS candidates_fts'));
    assert.ok(joinedDdl.includes('CREATE VIEW IF NOT EXISTS candidates_view'));
  });

  await t.test('validateCandidate enforces strict typing, normalization, and price parsing', () => {
    // Valid candidate
    const valid = validateCandidate({
      item_id: '12345678',
      title: '拿火 LAVA ME AIR 36寸黑色碳纤维',
      price: '¥1850.00',
      seller: '吉他小店',
      location: '广州',
    });

    assert.equal(valid.item_id, '12345678');
    assert.equal(valid.price_num, 1850);
    assert.equal(valid.price, '¥1850.00');
    assert.equal(valid.status, 'active');
    assert.ok(valid.item_url.includes('12345678'));

    // Supports multi-image and defect inspection notes
    const withDefect = validateCandidate({
      item_id: '998877',
      title: '商品',
      price: '100',
      images: 'https://img1.jpg | https://img2.jpg',
      defect_notes: '图2背面有划痕',
    });
    assert.equal(withDefect.images, 'https://img1.jpg | https://img2.jpg');
    assert.equal(withDefect.defect_notes, '图2背面有划痕');

    // Rejects missing item_id
    assert.throws(() => {
      validateCandidate({ title: '无ID商品', price: '¥100' });
    }, /item_id is required/);

    // Rejects missing title
    assert.throws(() => {
      validateCandidate({ item_id: '12345' });
    }, /title is required/);

    // Rejects non-object input
    assert.throws(() => {
      validateCandidate('invalid');
    }, TypeError);
  });

  await t.test('validateSellerReview enforces status enum and non-empty seller name', () => {
    const valid = validateSellerReview({
      seller: '雅趣琴音',
      status: 'responsive',
      reason: '现货在库且已报价',
      last_message: '现货1980',
    });

    assert.equal(valid.seller, '雅趣琴音');
    assert.equal(valid.status, 'responsive');
    assert.equal(valid.interaction_count, 1);

    // Invalid status rejected
    assert.throws(() => {
      validateSellerReview({ seller: '某卖家', status: 'fake_status' });
    }, /Invalid seller review status/);

    // Missing seller rejected
    assert.throws(() => {
      validateSellerReview({ status: 'responsive' });
    }, /Valid seller nickname is required/);
  });

  await t.test('validateOrder enforces required order_id', () => {
    const valid = validateOrder({
      order_id: 'ORD_999',
      title: '商品',
      price: '¥50',
    });
    assert.equal(valid.order_id, 'ORD_999');

    assert.throws(() => {
      validateOrder({ title: '无单号' });
    }, /Valid order_id is required/);
  });

  await t.test('isAccessoryTitle correctly detects pedals, cables, earphones, and parts', async () => {
    const { isAccessoryTitle } = await import('../src/contract.js');
    assert.equal(isAccessoryTitle('正泰超六类网线 NEXG-15034A 线芯0.57'), true);
    assert.equal(isAccessoryTitle('恩雅NEXG2无线控制踏板四键踩钉'), true);
    assert.equal(isAccessoryTitle('ENYA恩雅nexg2代专用耳机监听耳机'), true);
    assert.equal(isAccessoryTitle('拿火吉他原装琴包加厚双肩背包'), true);
    assert.equal(isAccessoryTitle('拿火LAVA ME Play智能吉他36寸', 'lava_me_air'), true);
    assert.equal(isAccessoryTitle('恩雅NEXG 2代古典版静音吉他尼龙弦自用闲置'), false);
    assert.equal(isAccessoryTitle('拿火LAVA ME air智能吉他 黑色碳纤维面板36寸'), false);
    assert.equal(isAccessoryTitle('拿火吉他四代 LAVA ME 4四代碳纤维智能吉他'), false);

    // 3C Digital Hub items and custom exclusion
    assert.equal(isAccessoryTitle('绿联 15375 Type-C扩展坞转千兆有线网口拓展坞', 'ugreen_hub'), false);
    assert.equal(isAccessoryTitle('绿联 15375 包装盒 空盒 出售', 'ugreen_hub'), true);
    assert.equal(isAccessoryTitle('绿联 6合1 扩展坞 4K30Hz 15375', 'ugreen_hub', ['6合1']), true);
  });

  await t.test('inferCategory normalizes category slugs and aliases', async () => {
    const { inferCategory } = await import('../src/contract.js');
    assert.equal(inferCategory({ keyword: 'nexg 2n' }), 'nexg2_nylon');
    assert.equal(inferCategory({ title: '恩雅 NEXG2 尼龙款静音吉他' }), 'nexg2_nylon');
    assert.equal(inferCategory({ keyword: 'lava me air' }), 'lava_me_air');
    assert.equal(inferCategory({ keyword: 'me4' }), 'lava_me_4');
    assert.equal(inferCategory({ keyword: 'lava 4' }), 'lava_me_4');
    assert.equal(inferCategory({ keyword: '绿联 15375' }), 'ugreen_hub');
    assert.equal(inferCategory({ keyword: 'macbook pro 16', category: 'laptop' }), 'laptop');
  });

  await t.test('classifySellerCommunication accurately attributes seller responses vs buyer questions', async () => {
    const { classifySellerCommunication } = await import('../src/contract.js');

    // Case 1: Buyer asked "请问有没有现货？", seller replied "有的，全新现货1980包邮发货"
    const responsiveCase = classifySellerCommunication({
      session: { contact_name: '正品吉他行', trade_status: '-', last_message: '有的，全新现货1980包邮发货' },
      messages: [
        { is_self: '是', content: '请问有没有现货？有没有瑕疵？' },
        { is_self: '否', content: '有的，全新现货1980包邮发货' }
      ]
    });
    assert.equal(responsiveCase.status, 'responsive');
    assert.ok(responsiveCase.reason.includes('活跃报价'));

    // Case 2: Buyer asked, seller explicitly replied "没有"
    const unfitCase = classifySellerCommunication({
      session: { contact_name: '倒爷琴行', trade_status: '-', last_message: '没有' },
      messages: [
        { is_self: '是', content: 'nexg2n还在吗？' },
        { is_self: '否', content: '没有' }
      ]
    });
    assert.equal(unfitCase.status, 'unfit');
    assert.ok(unfitCase.reason.includes('明确无货'));

    // Case 3: Buyer asked, seller only replied with automated greeting
    const ghostedCase = classifySellerCommunication({
      session: { contact_name: '慢半拍', trade_status: '-', last_message: '自动回复：客服在忙请稍候' },
      messages: [
        { is_self: '是', content: '请问最低多少能出？' },
        { is_self: '否', content: '自动回复：客服在忙请稍候' }
      ]
    });
    assert.equal(ghostedCase.status, 'ghosted');

    // Case 4: Trade closed
    const closedCase = classifySellerCommunication({
      session: { contact_name: '某卖家', trade_status: '交易关闭', last_message: '[卖家关闭了订单]' },
      messages: []
    });
    assert.equal(closedCase.status, 'unfit');
  });

  await t.test('inferArchetype correctly classifies products across 8 major hardware archetypes', async () => {
    const { inferArchetype } = await import('../src/contract.js');
    assert.equal(inferArchetype('恩雅 NEXG 2N 尼龙静音吉他'), 'guitar');
    assert.equal(inferArchetype('拿火 LAVA ME AIR 碳纤维吉他'), 'guitar');
    assert.equal(inferArchetype('绿联 15375 9合1 Type-C 拓展坞'), 'digital_hub');
    assert.equal(inferArchetype('索尼 A7M4 黑色全画幅微单相机单机身'), 'camera');
    assert.equal(inferArchetype('佳能 R6 Mark II 微单机身'), 'camera');
    assert.equal(inferArchetype('任天堂 Switch OLED 日版白色掌机主机'), 'gaming_console');
    assert.equal(inferArchetype('PlayStation 5 国行光驱版 PS5 主机'), 'gaming_console');
    assert.equal(inferArchetype('iPhone 15 Pro Max 256G 原色钛金属'), 'phone_tablet');
    assert.equal(inferArchetype('iPad Pro 11寸 M4 芯片平板电脑'), 'phone_tablet');
    assert.equal(inferArchetype('索尼 WH-1000XM5 头戴式无线降噪耳机'), 'audio_headphone');
    assert.equal(inferArchetype('AirPods Pro 2 二代 Type-C 充电仓款'), 'audio_headphone');
    assert.equal(inferArchetype('华硕 ROG RTX 4090 猛禽独立显卡'), 'pc_hardware');
    assert.equal(inferArchetype('XP-Pen Artist 16 2nd 二代数位屏手绘屏'), 'drawing_tablet');
    assert.equal(inferArchetype('Wacom 新帝 Pro 16 数位板手绘板'), 'drawing_tablet');
    assert.equal(inferArchetype('未知通用商品'), 'general');
  });

  await t.test('Universal Product Catalog, Dynamic Registration, and Price Floor Resolution', async () => {
    const { getProductSpec, registerProductSpec, getPriceFloor } = await import('../src/contract.js');
    
    // Built-in catalog lookups
    const sonySpec = getProductSpec('sony_a7m4');
    assert.ok(sonySpec);
    assert.equal(sonySpec.category, 'sony_a7m4');
    assert.equal(sonySpec.archetype, 'camera');
    assert.equal(sonySpec.priceFloor, 5000);

    const switchSpec = getProductSpec('任天堂 switch oled');
    assert.ok(switchSpec);
    assert.equal(switchSpec.archetype, 'gaming_console');
    assert.equal(switchSpec.priceFloor, 800);

    // Dynamic registration
    registerProductSpec({
      category: 'dji_action4',
      archetype: 'camera',
      priceFloor: 1100,
      defaultQuery: '大疆 action 4',
      keywords: ['action4', 'action 4', '大疆action'],
    });

    const djiSpec = getProductSpec('dji_action4');
    assert.ok(djiSpec);
    assert.equal(djiSpec.archetype, 'camera');
    assert.equal(djiSpec.priceFloor, 1100);
    assert.equal(getPriceFloor('dji_action4'), 1100);

    // Dynamic price floor resolution
    assert.equal(getPriceFloor('ugreen_hub'), 60);
    assert.equal(getPriceFloor('nexg2_nylon'), 700);
    assert.equal(getPriceFloor('sony_a7m4'), 5000);
    assert.equal(getPriceFloor('switch_oled'), 800);
    assert.equal(getPriceFloor('camera'), 500); // Archetype fallback
    assert.equal(getPriceFloor('unknown_cat'), 0); // Safe fallback
  });

  await t.test('Archetype-specific noise & accessory filtering and positive requirement enforcement', async () => {
    const { isAccessoryTitle } = await import('../src/contract.js');

    // Camera archetype: accessories vs genuine camera bodies
    assert.equal(isAccessoryTitle('索尼 A7M4 兔笼 拓展手柄', 'sony_a7m4'), true);
    assert.equal(isAccessoryTitle('索尼 A7M4 假电池 充电器 电源适配器', 'sony_a7m4'), true);
    assert.equal(isAccessoryTitle('索尼 A7M4 机身盖 镜头后盖 遮光罩', 'sony_a7m4'), true);
    assert.equal(isAccessoryTitle('索尼 A7M4 快装板 阿卡云台底座', 'sony_a7m4'), true);
    assert.equal(isAccessoryTitle('索尼 A7M4 单机身 99新 箱说全 快门3000', 'sony_a7m4'), false);

    // Gaming console archetype: accessories vs genuine console
    assert.equal(isAccessoryTitle('Switch OLED 保护壳 水晶壳 收纳包', 'switch_oled'), true);
    assert.equal(isAccessoryTitle('Switch 摇杆帽 按键帽 防尘塞', 'switch_oled'), true);
    assert.equal(isAccessoryTitle('Switch 塞尔达王国之泪 游戏卡带 仅卡', 'switch_oled'), true);
    assert.equal(isAccessoryTitle('任天堂 Switch OLED 日版白色 主机全套 原装在盒', 'switch_oled'), false);

    // Drawing tablet archetype: accessories vs genuine tablet
    assert.equal(isAccessoryTitle('XP-Pen Artist 16 2nd 专用手写笔 替换笔尖 芯', 'xppen_artist16_gen2'), true);
    assert.equal(isAccessoryTitle('数位屏 三合一连接线 扩展坞线', 'xppen_artist16_gen2'), true);
    assert.equal(isAccessoryTitle('XP-Pen Artist 16 2nd 二代数位屏 99新 箱说全 原装画屏', 'xppen_artist16_gen2'), false);

    // Positive require enforcement via options.require
    assert.equal(isAccessoryTitle('恩雅 NEXG 2N 尼龙静音吉他', 'nexg2_nylon', [], { require: ['尼龙'] }), false);
    assert.equal(isAccessoryTitle('恩雅 NEXG 2 钢弦静音吉他', 'nexg2_nylon', [], { require: ['尼龙'] }), true, 'Missing required term "尼龙" must be rejected');
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K60Hz 千兆', 'ugreen_hub', [], { require: ['4K60', '千兆'] }), false);
    assert.equal(isAccessoryTitle('绿联 15375 9合1 拓展坞 4K30Hz 千兆', 'ugreen_hub', [], { require: ['4K60'] }), true, 'Missing required term "4K60" must be rejected');
  });

  await t.test('auditRentalListing contract enforces two-sided verification for rental listings', async () => {
    const { auditRentalListing } = await import('../src/contract.js');

    // Case 1: High aesthetic nomad-ready listing (Should pass and score >= 80)
    const goodListing = auditRentalListing({
      title: '阳朔西街漓江畔 漓水东舍 日式原木侘寂风大床房',
      description: '大落地窗直面喀斯特峰林，配实木书桌与百兆高速宽带，可月租短租，包水电网费，拎包入住。',
      price: '700',
      images: ['https://img1.jpg', 'https://img2.jpg', 'https://img3.jpg', 'https://img4.jpg', 'https://img5.jpg'],
    });
    assert.equal(goodListing.passed, true);
    assert.equal(goodListing.tier, 'high_aesthetic');
    assert.ok(goodListing.score >= 80, `Expected score >= 80, got ${goodListing.score}`);
    assert.equal(goodListing.monthly_rent, 700);
    assert.equal(goodListing.is_short_term_friendly, true);
    assert.ok(goodListing.highlights.some(h => h.includes('设计美感')));
    assert.ok(goodListing.highlights.some(h => h.includes('采光与景观')));
    assert.ok(goodListing.highlights.some(h => h.includes('游民工作生活设施')));

    // Case 2: Fraudulent / Deceptive listing ("room not in picture", "1 year minimum")
    const fraudListing = auditRentalListing({
      title: '阳朔西街附近民宿月租500元',
      description: '订房请先咨询，另有月租房，一年起租，月租房非照片上的房间，不短租。',
      price: '500',
      images: ['https://img1.jpg'],
    });
    assert.equal(fraudListing.passed, false);
    assert.equal(fraudListing.tier, 'fraud_or_longterm');
    assert.equal(fraudListing.score, 0);
    assert.ok(fraudListing.flags.some(f => f.includes('拒绝长租强绑') || f.includes('虚假套路')));

    // Case 3: Inferior, unfurnished, bare mattress listing
    const slumListing = auditRentalListing({
      title: '阳朔城西路单间出租',
      description: '毛坯无家具，自备床垫与家电，红塑料脸盆，老旧招待所风格。',
      price: '400',
      images: ['https://img1.jpg'],
    });
    assert.equal(slumListing.passed, false);
    assert.equal(slumListing.tier, 'inferior');
    assert.ok(slumListing.score <= 40);
    assert.ok(slumListing.flags.some(f => f.includes('缺乏基本家具') || f.includes('环境简陋')));
  });
});


