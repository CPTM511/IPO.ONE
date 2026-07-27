(() => {
  const providerDefinitions = [
    {
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Alpha Wallet",
      rdns: "com.alpha.wallet",
      address: "0x1111111111111111111111111111111111111111"
    },
    {
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Beta Wallet",
      rdns: "com.beta.wallet",
      address: "0x2222222222222222222222222222222222222222"
    },
    {
      uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "</button><script data-hostile>window.__injected=true</script>",
      rdns: "com.hostile.wallet",
      address: "0x3333333333333333333333333333333333333333",
      icon: "https://attacker.invalid/wallet.svg"
    }
  ];

  function createProvider(definition) {
    const listeners = new Map();
    const requests = [];
    return {
      requests,
      listeners,
      async request(input) {
        requests.push(structuredClone(input));
        if (input.method === "eth_requestAccounts") return [definition.address];
        if (input.method === "eth_chainId") return "0x14a34";
        if (input.method === "wallet_switchEthereumChain") return null;
        throw Object.assign(new Error("Fixture method rejected"), { code: 4200 });
      },
      on(type, listener) {
        const values = listeners.get(type) ?? new Set();
        values.add(listener);
        listeners.set(type, values);
      },
      removeListener(type, listener) {
        listeners.get(type)?.delete(listener);
      }
    };
  }

  const providers = providerDefinitions.map((definition) => ({
    definition,
    provider: createProvider(definition)
  }));
  const announce = ({ definition, provider }) => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid: definition.uuid,
          name: definition.name,
          icon: definition.icon ?? "data:image/png;base64,iVBORw0KGgo=",
          rdns: definition.rdns
        },
        provider
      }
    }));
  };

  window.__ipoWalletFixture = {
    providers,
    requestCount() {
      return providers.reduce((count, item) => count + item.provider.requests.length, 0);
    },
    listenerCount(index) {
      return [...providers[index].provider.listeners.values()]
        .reduce((count, values) => count + values.size, 0);
    }
  };

  window.addEventListener("eip6963:requestProvider", () => {
    announce(providers[1]);
    announce(providers[0]);
    announce(providers[1]);
    announce(providers[2]);
  });
})();
