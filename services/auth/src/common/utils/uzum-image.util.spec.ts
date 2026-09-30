import { extractUzumImageUrl } from './uzum-image.util';

describe('extractUzumImageUrl', () => {
  const key = 'd5rj23b4eu2jdglghvt0';

  it('extracts Seller OpenAPI nested photo objects', () => {
    expect(extractUzumImageUrl({ photo: { '240': { high: `https://images.uzum.uz/${key}/t_product_240_high.jpg` } } }))
      .toBe(`https://images.uzum.uz/${key}/t_product_540_high.jpg`);
  });

  it('builds a usable URL from photoKey and bare CDN URLs', () => {
    expect(extractUzumImageUrl({ photoKey: key }, 'thumb'))
      .toBe(`https://images.uzum.uz/${key}/t_product_240_high.jpg`);
    expect(extractUzumImageUrl(`https://images.uzum.uz/${key}`, 'high'))
      .toBe(`https://images.uzum.uz/${key}/original.jpg`);
  });

  it('walks product and SKU fallback fields', () => {
    expect(extractUzumImageUrl({ skuList: [{ previewImage: { photoKey: key } }] }))
      .toBe(`https://images.uzum.uz/${key}/t_product_540_high.jpg`);
  });
});
