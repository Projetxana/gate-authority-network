const base =
  process.env.SUPABASE_URL?.replace(/\/+$/, "");

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!base) {
  throw new Error("SUPABASE_URL is required");
}

if (!key) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const response = await fetch(
  `${base}/rest/v1/rpc/gate_configure_ssf_worker`,
  {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      p_functions_base_url:
        `${base}/functions/v1`
    })
  }
);

const text = await response.text();

if (!response.ok) {
  throw new Error(
    `runtime_configuration_failed:${response.status}:${text}`
  );
}

console.log(
  "GATE Supabase runtime configured.",
  "SSF worker job:",
  text
);
