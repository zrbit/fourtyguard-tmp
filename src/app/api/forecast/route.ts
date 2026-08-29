export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 24 || latitude > 50 || longitude < -125 || longitude > -66) {
    return Response.json({ error: "Choose a location in the continental United States." }, { status: 400 });
  }
  try {
    const upstream = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,apparent_temperature,shortwave_radiation&temperature_unit=fahrenheit&forecast_days=2&timezone=GMT`, { cache: "no-store" });
    const data = await upstream.json() as { hourly?: { time?: string[]; temperature_2m?: number[]; apparent_temperature?: number[]; shortwave_radiation?: number[] } };
    if (!upstream.ok || !data.hourly?.time?.length) throw new Error("Forecast data was unavailable.");
    const nowHour = new Date().toISOString().slice(0, 13);
    const points = data.hourly.time.map((time, index) => ({ time, temperatureF: data.hourly?.temperature_2m?.[index], apparentF: data.hourly?.apparent_temperature?.[index], solarWm2: data.hourly?.shortwave_radiation?.[index] })).filter(point => point.time.slice(0, 13) >= nowHour && typeof point.temperatureF === "number").slice(0, 24);
    if (!points.length) throw new Error("No upcoming forecast hours were returned.");
    const hottest = [...points].sort((a, b) => (b.apparentF ?? b.temperatureF ?? -Infinity) - (a.apparentF ?? a.temperatureF ?? -Infinity))[0];
    return Response.json({ peakTemperatureF: Math.round((Math.max(...points.map(point => point.temperatureF ?? -Infinity))) * 10) / 10, peakApparentF: Math.round(((hottest.apparentF ?? hottest.temperatureF ?? 0) * 10)) / 10, peakSolarWm2: Math.round(Math.max(...points.map(point => point.solarWm2 ?? 0))), peakTime: hottest.time });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load the local forecast." }, { status: 502 });
  }
}
