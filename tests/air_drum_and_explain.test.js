import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferArchetype,
  inferCategory,
  getProductSpec,
  isAccessoryTitle,
  assessLowPriceTrap,
  explainCandidateEvaluation,
  AIR_DRUM_ACCESSORY_REGEX,
} from '../src/contract.js';

test('Air Drum & PocketDrum Archetype Contract', async (t) => {
  await t.test('inferArchetype accurately identifies air drums and electronic drums', () => {
    assert.equal(inferArchetype('AeroBand PocketDrum 2 Ultra 空气鼓'), 'air_drum');
    assert.equal(inferArchetype('Aeroband 迷你体感空气鼓棒套装'), 'air_drum');
    assert.equal(inferArchetype('电子架子鼓 便携折叠电鼓'), 'air_drum');
    // Ensure guitar is not confused
    assert.equal(inferArchetype('Aeroband AG01 智能吉他'), 'guitar');
  });

  await t.test('inferCategory and getProductSpec recognize aeroband_pocketdrum', () => {
    assert.equal(inferCategory({ title: 'AeroBand PocketDrum 2 Plus 体感空气鼓 顺丰包邮' }), 'aeroband_pocketdrum');
    assert.equal(inferCategory({ keyword: 'aeroband pocketdrum 2' }), 'aeroband_pocketdrum');
    assert.equal(inferCategory({ title: 'Pocketdrum 2 Ultra 空气架子鼓 全套' }), 'aeroband_pocketdrum');

    const spec = getProductSpec('aeroband_pocketdrum');
    assert.ok(spec, 'aeroband_pocketdrum catalog spec must exist');
    assert.equal(spec.priceFloor, 400);
    assert.equal(spec.targetPrice, 750);
    assert.equal(spec.archetype, 'air_drum');

    // Title resolution to spec
    const specByTitle = getProductSpec('AeroBand PocketDrum 2 Ultra');
    assert.ok(specByTitle);
    assert.equal(specByTitle.category, 'aeroband_pocketdrum');
  });

  await t.test('AIR_DRUM_ACCESSORY_REGEX & isAccessoryTitle intercept parts and teasers', () => {
    // Single stick, adapter only, pedal only, mute pads
    assert.ok(AIR_DRUM_ACCESSORY_REGEX.test('Areoband空气鼓棒（只有一个鼓棒 另一个丢了）'));
    assert.ok(AIR_DRUM_ACCESSORY_REGEX.test('AeroBand 专用蓝牙音频适配器 发射器'));
    assert.ok(AIR_DRUM_ACCESSORY_REGEX.test('只出两个脚擦感应器 踏板'));
    assert.ok(AIR_DRUM_ACCESSORY_REGEX.test('收一个 AeroBand PocketDrum 2 脚擦'));
    assert.ok(AIR_DRUM_ACCESSORY_REGEX.test('出消音垫 练习垫 鼓槌套'));

    // isAccessoryTitle integration
    assert.equal(isAccessoryTitle('AeroBand 单只鼓棒配件', 'aeroband_pocketdrum'), true);
    assert.equal(isAccessoryTitle('求购 aeroband 2代 接收器', 'aeroband_pocketdrum'), true);

    // Full instruments must NOT be filtered
    assert.equal(isAccessoryTitle('AeroBand PocketDrum 2 Max 纯白双鼓棒双脚擦全套', 'aeroband_pocketdrum'), false);
    assert.equal(isAccessoryTitle('AeroBand PocketDrum 2 Plus 体感架子鼓 箱说全 99新', 'aeroband_pocketdrum'), false);
  });

  await t.test('assessLowPriceTrap detects deposit/pedal teasers for air drum', () => {
    // 88 RMB teaser
    const trap = assessLowPriceTrap({
      price: 88,
      title: 'aeroband pocketdrum 2 空气架子鼓 体感鼓棒',
      category: 'aeroband_pocketdrum',
    });
    assert.equal(trap.isTrapRisk, true);
    assert.equal(trap.tier, 'deposit_teaser');
    assert.equal(trap.riskLevel, 'HIGH');

    // Valid price
    const normal = assessLowPriceTrap({
      price: 780,
      title: 'AeroBand PocketDrum 2 Plus 全套 顺丰包邮',
      category: 'aeroband_pocketdrum',
    });
    assert.equal(normal.isTrapRisk, false);
    assert.equal(normal.tier, 'sweet_spot');
    assert.equal(normal.riskLevel, 'LOW');
  });
});

test('Diagnostic Engine explainCandidateEvaluation (能读·能试·能调)', async (t) => {
  await t.test('rejects accessory listings with complete 4-step trace', () => {
    const res = explainCandidateEvaluation({
      title: 'Aeroband 接收器 转接头 蓝牙适配器',
      price: 90,
      category: 'aeroband_pocketdrum',
    });

    assert.equal(res.verdict, 'REJECT_ACCESSORY');
    assert.equal(res.action, 'REJECT_ACCESSORY');
    assert.equal(res.is_accessory, true);
    assert.ok(res.accessory_reason);
    assert.ok(Array.isArray(res.trace));
    assert.equal(res.trace.length, 4);
    assert.equal(res.trace[0].passed, false);
  });

  await t.test('rejects below price floor (deposit/placeholder trap)', () => {
    const res = explainCandidateEvaluation({
      title: 'AeroBand PocketDrum 2 Ultra 空气架子鼓 全套箱说全',
      price: 88,
      category: 'aeroband_pocketdrum',
    });

    assert.equal(res.verdict, 'REJECT_PRICE_FLOOR');
    assert.equal(res.action, 'REJECT_BELOW_FLOOR');
    assert.equal(res.is_below_floor, true);
    assert.equal(res.price_floor, 400);
    assert.equal(res.low_price_assessment.isTrapRisk, true);
    assert.ok(res.explanation.includes('低于品类底价'));
  });

  await t.test('accepts genuine market price candidate', () => {
    const res = explainCandidateEvaluation({
      title: 'AeroBand PocketDrum 2 Plus 体感架子鼓 箱说全 99新',
      price: 799,
      category: 'aeroband_pocketdrum',
      targetPrice: 700,
    });

    assert.equal(res.verdict, 'PASS_NORMAL');
    assert.equal(res.action, 'KEEP');
    assert.equal(res.is_accessory, false);
    assert.equal(res.is_below_floor, false);
    assert.equal(res.is_spike, false);
    assert.ok(res.explanation.includes('合理区间') || res.explanation.includes('主商品契约'));
  });

  await t.test('triggers snipe spike when price meets target condition', () => {
    const res = explainCandidateEvaluation({
      title: 'AeroBand PocketDrum 2 Ultra 箱说齐全 仅拆封',
      price: 599,
      category: 'aeroband_pocketdrum',
      targetPrice: 650,
    });

    assert.equal(res.verdict, 'TRIGGER_ALERT');
    assert.equal(res.action, 'ALERT_SNIPE');
    assert.equal(res.is_spike, true);
    assert.ok(res.explanation.includes('低于设定目标价'));
  });
});
