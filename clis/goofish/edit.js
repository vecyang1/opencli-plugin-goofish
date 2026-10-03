import fs from 'node:fs';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import { safeGoto, checkAuth } from './_shared.js';
import { auditSellerCopy } from './_contract.js';

export const command = cli({
  site: 'goofish',
  name: 'edit',
  access: 'write',
  description: '编辑与优化闲鱼已发布宝贝 (标题、描述、售价、原价及成色，支持文本文件换行与详情页截图存证)',
  domain: 'www.goofish.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '闲鱼商品 ID (如: 1089657928967)' },
    { name: 'title', type: 'str', required: false, help: '优化后的新标题' },
    { name: 'description', type: 'str', required: false, help: '优化后的新宝贝描述' },
    { name: 'description_file', type: 'str', required: false, help: '从指定文本文件读取长文案 (避免命令行转义导致换行丢失)' },
    { name: 'price', type: 'str', required: false, help: '调整后的新售价 (元)' },
    { name: 'original_price', type: 'str', required: false, help: '原价 (选填)' },
    { name: 'condition', type: 'str', required: false, help: '成色 (全新/几乎全新/轻微使用/明显使用/老旧)' },
    { name: 'screenshot', type: 'str', required: false, help: '提交成功后详情页截图保存路径 (如: /tmp/item.png)' },
    { name: 'diagnose', type: 'bool', default: false, help: '仅诊断当前商品编辑页面可用性与入口，不执行修改' },
    { name: 'submit', type: 'bool', default: false, help: '确认提交修改并保存' },
  ],
  columns: [
    'item_id',
    'status',
    'old_price',
    'new_price',
    'editor_length',
    'submit_state',
    'message',
  ],
  func: async (page, kwargs) => {
    let itemId = String(kwargs.id || kwargs._?.[0] || '').trim();
    if (itemId.startsWith('http')) {
      try {
        itemId = new URL(itemId).searchParams.get('id') || itemId;
      } catch (e) {}
    }
    if (!itemId) {
      throw new ArgumentError('必须指定要编辑的闲鱼商品 ID');
    }

    const title = kwargs.title ? String(kwargs.title).trim() : '';
    let description = kwargs.description ? String(kwargs.description).trim() : '';
    if (kwargs.description_file) {
      const filePath = String(kwargs.description_file).trim();
      if (fs.existsSync(filePath)) {
        description = fs.readFileSync(filePath, 'utf8').trim();
      } else {
        throw new ArgumentError(`指定的文案文件不存在: ${filePath}`);
      }
    } else if (description) {
      // Unescape literal \n if passed via shell
      description = description.replace(/\\n/g, '\n');
    }

    // Defensive formatting: ensure bullet points and section headers have proper line breaks if passed via single-line command line
    if (!kwargs.description_file && description) {
      if (!description.includes('\n')) {
        description = description.replace(/([•·\-\*])/g, '\n$1');
        description = description.replace(/(【[^】]+】)/g, '\n\n$1\n');
      }
      description = description.replace(/\n{3,}/g, '\n\n').trim();
    }

    const price = kwargs.price ? String(kwargs.price).trim() : '';
    const originalPrice = kwargs.original_price ? String(kwargs.original_price).trim() : '';
    const isDiagnose = Boolean(kwargs.diagnose);
    const shouldSubmit = Boolean(kwargs.submit);

    // Combine title and description into the editor text if provided
    let combinedEditorText = '';
    if (title && description) {
      combinedEditorText = `${title}\n\n${description}`;
    } else if (title) {
      combinedEditorText = title;
    } else if (description) {
      combinedEditorText = description;
    }

    const copyAudit = auditSellerCopy(description || combinedEditorText);

    const targetUrl = `https://www.goofish.com/publish?itemId=${itemId}`;
    await safeGoto(page, targetUrl);
    await checkAuth(page);
    await page.wait(2.5);

    const editResult = await page.evaluate(async ({ combinedEditorText, newPrice, newOrigPrice, shouldSubmit, isDiagnose }) => {
      const editorEl = document.querySelector('div[class*="editor--"], div[contenteditable="true"]');
      const allInputs = Array.from(document.querySelectorAll('input.ant-input, input[placeholder="0.00"]'));
      
      let priceInput = allInputs[0] || null;
      let origPriceInput = allInputs[1] || null;

      let oldEditorText = editorEl ? (editorEl.innerText || editorEl.textContent || '').trim() : '';
      let oldPrice = priceInput ? priceInput.value : '';

      // Hook network requests for diagnostic observability
      if (!window._networkHooked) {
        window._networkHooked = true;
        window._capturedRequests = [];
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
          this._url = url;
          this._method = method;
          return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
          this.addEventListener('load', () => {
            window._capturedRequests.push({
              type: 'xhr',
              url: String(this._url).slice(0, 120),
              status: this.status,
              body: typeof body === 'string' ? body.slice(0, 1000) : null,
              response: this.responseText ? this.responseText.slice(0, 1000) : null,
            });
          });
          return origSend.apply(this, arguments);
        };

        const origFetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          try {
            const clone = res.clone();
            const text = await clone.text();
            window._capturedRequests.push({
              type: 'fetch',
              url: typeof args[0] === 'string' ? args[0].slice(0, 120) : 'object',
              status: res.status,
              response: text.slice(0, 1000),
            });
          } catch (e) {}
          return res;
        };
      }

      if (isDiagnose) {
        // Inspect Ant Design Form instance
        const formEl = document.querySelector('form.ant-form');
        let formFields = null;

        if (formEl) {
          const fiberKey = Object.keys(formEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (fiberKey) {
            let curr = formEl[fiberKey];
            while (curr && !formFields) {
              const props = curr.memoizedProps;
              if (props?.form && typeof props.form.getFieldsValue === 'function') {
                formFields = props.form.getFieldsValue();
                break;
              }
              curr = curr.return;
            }
          }
        }

        const allEditors = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.getAttribute('contenteditable') === 'true' || 
                 el.tagName === 'TEXTAREA' || 
                 (el.className && typeof el.className === 'string' && el.className.includes('editor'));
        }).map(el => ({
          tag: el.tagName,
          class: el.className,
          contenteditable: el.getAttribute('contenteditable'),
          text: (el.innerText || el.value || '').slice(0, 100)
        }));

        const editorEl = document.querySelector('div[class*="editor--"][contenteditable="true"], div[contenteditable="true"]');
        let editorFiberInfo = null;
        if (editorEl) {
          const fiberKey = Object.keys(editorEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          let curr = fiberKey ? editorEl[fiberKey] : null;
          let propKeys = [];
          let handlers = [];
          while (curr && handlers.length < 5) {
            const p = curr.memoizedProps;
            if (p) {
              for (const k of Object.keys(p)) {
                if (typeof p[k] === 'function' && !handlers.includes(k)) handlers.push(k);
              }
            }
            curr = curr.return;
          }
          editorFiberInfo = {
            innerHTML: editorEl.innerHTML,
            handlers,
          };
        }

        return {
          ok: true,
          oldPrice,
          newPrice: oldPrice,
          editorLength: oldEditorText.length,
          submitState: 'diagnose_only',
          message: JSON.stringify({
            editorFiberInfo,
            formFields,
          }, null, 2),
        };
      }

      // 0. Locate Ant Design Form instance
      const formEl = document.querySelector('form.ant-form');
      let antForm = null;
      if (formEl) {
        const fiberKey = Object.keys(formEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let curr = formEl[fiberKey];
          while (curr && !antForm) {
            const props = curr.memoizedProps;
            if (props?.form && typeof props.form.getFieldsValue === 'function') {
              antForm = props.form;
              break;
            }
            curr = curr.return;
          }
        }
      }

      // If form instance exists, normalize images (fixing type 10000 -> 0 to bypass FAIL_BIZ_VIDEO_NO_ID_OR_OSSOBJECT)
      if (antForm) {
        try {
          const currentImages = antForm.getFieldValue('imageInfoDOList') || [];
          const normalizedImages = currentImages.map(img => ({
            ...img,
            type: 0, // ensure all items are treated as standard pictures
          }));
          const updates = {
            imageInfoDOList: normalizedImages,
          };
          if (combinedEditorText) {
            updates.itemTextDTO = { desc: combinedEditorText };
          }
          if (newPrice) {
            updates.itemPriceDTO = {
              priceInCent: Number(newPrice),
              origPriceInCent: newOrigPrice ? Number(newOrigPrice) : 0,
            };
          }
          antForm.setFieldsValue(updates);
        } catch (e) {}
      }

      // 1. Update Editor Content with clean <br> line breaks
      if (combinedEditorText && editorEl) {
        editorEl.focus();
        const safeLines = combinedEditorText.split('\n').map(line => {
          return line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        });
        editorEl.innerHTML = safeLines.join('<br>');

        // Trigger React handlers via Fiber
        const fiberKey = Object.keys(editorEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let curr = editorEl[fiberKey];
          while (curr) {
            if (typeof curr.memoizedProps?.onChange === 'function') {
              try { curr.memoizedProps.onChange(combinedEditorText); } catch (e) {}
            }
            if (typeof curr.memoizedProps?.onInput === 'function') {
              try { curr.memoizedProps.onInput({ target: editorEl, currentTarget: editorEl }); } catch (e) {}
            }
            curr = curr.return;
          }
        }

        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        editorEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 2. Update Price
      if (newPrice && priceInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        priceInput.focus();
        if (setter) {
          setter.call(priceInput, String(newPrice));
        } else {
          priceInput.value = String(newPrice);
        }
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 3. Update Original Price if specified
      if (newOrigPrice && origPriceInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        origPriceInput.focus();
        if (setter) {
          setter.call(origPriceInput, String(newOrigPrice));
        } else {
          origPriceInput.value = String(newOrigPrice);
        }
        origPriceInput.dispatchEvent(new Event('input', { bubbles: true }));
        origPriceInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 4. Verify Readback
      const readbackText = editorEl ? (editorEl.innerText || editorEl.textContent || '').trim() : '';
      const readbackPrice = priceInput ? priceInput.value : '';

      // 5. Submit if requested
      let submitState = 'dry_run_ready';
      let message = isDiagnose
        ? `[诊断完成] 页面就绪，当前价格: ¥${oldPrice || readbackPrice}`
        : (shouldSubmit
            ? `已触发提交... 价格: ¥${readbackPrice}`
            : `[本地预览未保存，需加 --submit 正式提交] 描述: ${readbackText.slice(0, 30)}... (${readbackText.length}字), 价格: ¥${readbackPrice}`);

      if (shouldSubmit) {
        const publishBtn = document.querySelector('button[class*="publish-button--"]')
          || Array.from(document.querySelectorAll('button')).find(b => {
            const t = (b.innerText || '').trim();
            return t === '发布' || t === '确认发布' || t === '保存';
          });

        if (publishBtn && !publishBtn.disabled) {
          publishBtn.click();
          submitState = 'click_dispatched';
        } else {
          submitState = 'submit_button_disabled_or_not_found';
          message = '未找到可点击的发布按钮或按钮处于禁用状态';
        }
      }

      return {
        ok: true,
        oldPrice,
        newPrice: readbackPrice,
        editorLength: readbackText.length,
        submitState,
        message,
      };
    }, { combinedEditorText, newPrice: price, newOrigPrice: originalPrice, shouldSubmit, isDiagnose });

    let finalMessage = editResult.message;
    if (!copyAudit.pass) {
      finalMessage += ` | ⚠️ 文案合规拦截: ${copyAudit.flags.join('; ')}`;
    } else if (copyAudit.warnings.length > 0) {
      finalMessage += ` | ℹ️ 文案优化建议: ${copyAudit.warnings.join('; ')}`;
    }
    let finalStatus = isDiagnose ? 'diagnosed' : (shouldSubmit ? 'submitting' : 'preview');

    if (shouldSubmit && editResult.submitState === 'click_dispatched') {
      await page.wait(3.5);
      
      // Check post-submit state: URL change, modal, or toast error
      const postSubmitState = await page.evaluate(() => {
        const currentUrl = window.location.href;
        const bodyText = document.body ? document.body.innerText : '';
        
        // 1. Modal check (e.g. 提示弹窗)
        const modalConfirm = Array.from(document.querySelectorAll('.ant-modal button, div[class*="modal"] button')).find(b => {
          const t = (b.innerText || '').trim();
          return t === '确定' || t === '确认' || t === '我知道了' || t === '继续发布';
        });
        if (modalConfirm) {
          modalConfirm.click();
        }

        // 2. Error message check with parent context
        const errorNodes = Array.from(document.querySelectorAll('.ant-form-item-explain-error, .ant-message-error, div[class*="error"]')).map(el => {
          return (el.innerText || '').trim();
        }).filter(Boolean);

        const captured = window._capturedRequests || [];
        const mtopFail = captured.find(c => c.response && c.response.includes('FAIL_BIZ_'));
        let mtopErrorText = '';
        if (mtopFail) {
          try {
            const parsed = JSON.parse(mtopFail.response);
            mtopErrorText = parsed.ret?.[0] || '';
          } catch (e) {}
        }

        return {
          currentUrl,
          hasError: errorNodes.length > 0 || !!mtopErrorText,
          errorMessage: mtopErrorText || errorNodes.join(' | '),
          isSuccessUrl: /item\?id=/.test(currentUrl) || /personal/.test(currentUrl),
          bodySnippet: bodyText.slice(0, 200),
        };
      });

      if (postSubmitState.isSuccessUrl || !postSubmitState.hasError) {
        finalStatus = 'success';
        finalMessage = `发布成功！页面状态: ${postSubmitState.currentUrl}`;

        if (kwargs.screenshot) {
          try {
            await safeGoto(page, `https://www.goofish.com/item?id=${itemId}`);
            await page.wait(3.0);
            await page.screenshot({ path: kwargs.screenshot });
            finalMessage += ` | 截图已保存至: ${kwargs.screenshot}`;
          } catch (err) {
            finalMessage += ` | 截图保存失败: ${err.message}`;
          }
        }
      } else {
        finalStatus = 'failed';
        finalMessage = `提交后提示: ${postSubmitState.errorMessage || postSubmitState.bodySnippet}`;
      }
    } else if (kwargs.screenshot) {
      try {
        await page.screenshot({ path: kwargs.screenshot });
        finalMessage += ` | 编辑器截图已保存至: ${kwargs.screenshot}`;
      } catch (err) {
        finalMessage += ` | 截图保存失败: ${err.message}`;
      }
    }

    return [{
      item_id: itemId,
      status: finalStatus,
      old_price: editResult.oldPrice ? `¥${editResult.oldPrice}` : '-',
      new_price: editResult.newPrice ? `¥${editResult.newPrice}` : '-',
      editor_length: `${editResult.editorLength} 字`,
      submit_state: editResult.submitState,
      message: finalMessage,
    }];
  },
});
