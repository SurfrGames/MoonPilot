// Supporter Pack purchase for the Microsoft Store version.
// Uses the Digital Goods API, which exists only in Microsoft Edge 134+ when the app was installed from the
// Microsoft Store on Windows. Everywhere else the service is missing and the game shows no purchase at all.
const Store = (() => {
  const METHOD = "https://store.microsoft.com/billing";
  const ITEM = "supporter";                                  // must equal the add-on's product ID in Partner Center
  let service = null, item = null, owned = false;
  try { owned = localStorage.getItem("moonpilot.supporter") === "yes"; } catch (e) {}
  const setOwned = v => { owned = v; try { localStorage.setItem("moonpilot.supporter", v ? "yes" : "no"); } catch (e) {} };

  async function init() {                                    // resolves true when the pack can be bought here
    if (window.getDigitalGoodsService === undefined) return false;
    try {
      service = await window.getDigitalGoodsService(METHOD);
      item = (await service.getDetails([ITEM]))[0] || null;
      setOwned((await service.listPurchases()).some(p => p.itemId === ITEM));   // the Store is the record of what was bought
    } catch (e) { service = null; item = null; }
    return !!item;
  }

  async function buy() {
    if (!service || !item) return false;
    try {
      const request = new PaymentRequest([{supportedMethods: METHOD, data: {sku: item.itemId}}],
        {total: {label: item.title || "Supporter Pack", amount: {currency: item.price.currency, value: String(item.price.value)}}});
      const response = await request.show();
      await response.complete("success");
      setOwned(true);
      return true;
    } catch (e) { return false; }                            // cancelled or failed: nothing changes
  }

  function price() {
    try { return item ? new Intl.NumberFormat(navigator.language, {style: "currency", currency: item.price.currency}).format(item.price.value) : ""; }
    catch (e) { return ""; }
  }
  return {init, buy, price, owned: () => owned, available: () => !!item};
})();
