# Ayudante de captura de SnetForever (tarea 19, Rulings F4-27, F4-28 y F4-30).
#
# Busca la mini franja de colores del addon en el área de cliente de la ventana de Wow.exe cuya ruta contiene
# \<Carpeta>\ (y en ningún otro sitio de la pantalla). Cuando la encuentra, envía solo un recorte de Ancho x Alto px
# (440 x 60) que empieza 8 px antes de la magia por arriba y por la izquierda (recortado a los bordes del cliente). Nunca
# envía la pantalla entera y nunca guarda imágenes: el único archivo que lee es el de -Archivo, y no escribe ninguno.
#
# Salida, una línea JSON por mensaje (la primera, {"t":"listo","version":1}):
#   {"t":"imagen","ancho","alto","x0","y0","b64"}   recorte en BGRA de arriba abajo; x0/y0 = origen dentro del cliente
#   {"t":"estado","juego":"no"} | {"t":"estado","juego":"si","exe","minimizado","primerPlano","ancho","alto"}   al cambiar
#   {"t":"nada"}                                    solo con -Archivo, si no hay franja
#   {"t":"error","texto"}                           solo con -Archivo, si no se puede leer la imagen
#   {"t":"fin","vueltas","conPista","ms"}           solo con -Archivo y -Repetir > 1 (comprobación de la pista)
# Con -Archivo, "imagen" y "nada" llevan además "ms": lo que tardó esa vuelta (búsqueda y recorte), sin leer el archivo.
#
# Qué cuenta como franja: la firma de la magia (los cinco tramos de color, como pareceFranja de JS), con celdas de como
# mucho 3,5 px (el juego usa 2), y una cabecera que se lee bien: los 6 primeros bytes con la magia 0x53 0x46 completa y
# una longitud de como mucho 1.400 (MAX_CARGA). Se prueban como mucho 64 firmas por búsqueda (como el códec de JS).
#
# Ritmo (Ruling F4-30):
# - Sin franja: una búsqueda en todo el cliente cada PeriodoMs (1 s). La franja se ve al menos 2 vueltas y 3 s.
# - Con franja: cada PeriodoRapidoMs (100 ms), y solo se lee cada pista (el recorte anterior ampliado 16 px por lado; hasta
#   4 pistas). Cada 2 s, además, una búsqueda en todo el cliente (sin las zonas de las pistas), por si la franja de verdad
#   está en otro sitio y una pista se quedó sobre un falso positivo.
# - Si se pierde la franja, sigue 1 s más a 100 ms y luego vuelve a 1 s. Sin pistas, el cliente entero se copia como
#   mucho cada 250 ms (la primera, enseguida al perder la pista).
# - Por cada pista, solo se envía el recorte si su hash FNV-1a cambió (el hash se calcula sobre lo ya copiado, sin
#   crear el recorte si no hace falta).
# - Sin juego, lo busca cada 5 s. Termina cuando el proceso PadrePid termina (se guarda su handle al empezar, así que
#   un PID reutilizado no cuenta como vivo).
#
# Primer plano (Ruling F4-28): solo se lee la pantalla si la ventana del juego es la de primer plano
# (GetForegroundWindow() == hwnd, o su raíz con GetAncestor(GA_ROOTOWNER)). Si no lo es o está minimizada, no se lee
# ningún píxel: se manda el estado si cambió y se vuelve a mirar a los PeriodoEsperaMs (250 ms). Al enviar una pregunta,
# el jugador acaba de pulsar Intro en el juego. Ojo: con el juego delante, CopyFromScreen copia lo que se ve en el
# rectángulo del cliente, así que puede leer ventanas «siempre visibles» que lo tapen (avisos, OSD); nunca se envía nada
# de ahí sin la magia y una cabecera válidas. Si justo después de copiar el juego ya no está delante, o su cliente se
# movió o cambió de tamaño, la vuelta se descarta.
#
# Con -Archivo <bmp|png>: procesa esa imagen una vez (como si fuera el cliente entero, con las mismas vueltas que la
# pantalla) y sale con 0 (2 si no se lee). Con -Repetir <n>, da n vueltas sobre ella: de la segunda en adelante, con pista
# (y, como el recorte no cambia, sin volver a enviarlo).
#
# Notas aceptadas por el controlador:
# - Add-Type compila el C# con el compilador de PowerShell, que usa archivos temporales en %TEMP% y los borra él mismo;
#   el ayudante no escribe ninguno.
# - DPI: SetProcessDpiAwarenessContext(-4) y, si falla (por ejemplo, porque el manifiesto de powershell.exe ya fijó un
#   modo), SetProcessDPIAware. Con un solo monitor da igual; con varios de DPI distinto se comprobará en la tarea 22.
param(
  [int]$PadrePid = 0,
  [string]$Archivo = '',
  [int]$Ancho = 440,
  [int]$Alto = 60,
  [int]$PeriodoMs = 1000,
  [int]$PeriodoRapidoMs = 100,
  [int]$PeriodoEsperaMs = 250,
  [string]$Carpeta = '_forever_',
  [int]$Repetir = 1
)

$ErrorActionPreference = 'Stop'

$codigo = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace SnetForever
{
    public static class Captura
    {
        // ---------- búsqueda de la magia: la misma firma que pareceFranja / firmaEn de app/src/franja/codec.mjs ----------

        const double PasoMax = 12;          // ESPEC.pasoMax
        const double PasoMinDecodificar = 1.5; // ESPEC.pasoMin
        const double PasoFirmaMin = 1.5;    // PASO_FIRMA_MIN
        const int CoherenciaCeldas = 24;    // COHERENCIA_CELDAS
        const double CoherenciaMin = 0.55;  // COHERENCIA_MIN
        const int CoherenciaPuntosMin = 12; // COHERENCIA_PUNTOS_MIN
        // Ruling F4-30: el juego pinta celdas de 2 px; por encima de 3,5 px no se envía nada.
        const double PasoTope = 3.5;
        const int MaxCarga = 1400;          // MAX_CARGA del códec
        const int MaxCandidatas = 64;       // firmas probadas como mucho por búsqueda (como candidatas() de JS)
        public const int MaxPistas = 4;
        const int EsperaSinPistasMs = 250;  // sin pistas, una búsqueda completa como mucho cada 250 ms (revisión final)
        static readonly int[] ValoresMagia = CalcularMagia();

        // Valores de 3 bits de las cinco primeras celdas de la magia 0x53 0x46 (cinco tramos de color).
        static int[] CalcularMagia()
        {
            int m = (0x53 << 8) | 0x46;
            int[] v = new int[5];
            for (int k = 0; k < 5; k++) v[k] = (m >> (13 - 3 * k)) & 7;
            return v;
        }

        // Valores de 3 bits de la fila y (R = bit 2, G = bit 1, B = bit 0; encendido a partir de 128), de un píxel BGRA
        // por byte. Se calculan una vez por fila: la firma, la coherencia y la cabecera leen de aquí.
        static void ValoresFila(byte[] d, int ancho, int y, byte[] f)
        {
            int p = y * ancho * 4;
            for (int x = 0; x < ancho; x++, p += 4)
                f[x] = (byte)(((d[p + 2] >> 7) << 2) | ((d[p + 1] >> 7) << 1) | (d[p] >> 7)); // sin saltos: el ruido no se predice
        }

        static bool CoherenteFila(byte[] f, int ancho, int x, double paso)
        {
            int bien = 0, total = 0;
            for (int i = 0; i < CoherenciaCeldas; i++)
            {
                int xc = (int)Math.Floor(x + (i + 0.5) * paso);
                if (xc >= ancho) break;
                int centro = f[xc];
                for (int j = 0; j < 2; j++)
                {
                    double fr = j == 0 ? 0.25 : 0.75;
                    int xp = (int)Math.Floor(x + (i + fr) * paso);
                    if (xp >= ancho || xp == xc) continue;
                    total++;
                    if (f[xp] == centro) bien++;
                }
            }
            return total >= CoherenciaPuntosMin && (double)bien / total >= CoherenciaMin;
        }

        // inicios: 5 enteros que se reutilizan (sin reservar memoria en cada candidata); salen con el comienzo de cada tramo.
        static double FirmaEn(byte[] f, int ancho, int x, int[] inicios)
        {
            int limite = Math.Min(ancho, x + (int)Math.Floor(PasoMax * 6) + 4);
            double largoMax = PasoMax * 1.6;
            inicios[0] = x;
            int pos = x;
            for (int k = 0; k < 4; k++)
            {
                int v = ValoresMagia[k], sig = ValoresMagia[k + 1];
                int q = pos + 1;
                while (q < limite)
                {
                    int c = f[q];
                    if (c == v) { q++; continue; }
                    if (c != sig && q + 1 < limite && f[q + 1] == v) { q += 2; continue; }
                    break;
                }
                if (q >= limite) return 0;
                if (f[q] != sig)
                {
                    // Parpadeo en el borde entre los dos tramos.
                    if (q + 1 < limite && f[q + 1] == sig) q++;
                    else return 0;
                }
                if (q - pos > largoMax) return 0;
                inicios[k + 1] = q;
                pos = q;
            }
            double p = (inicios[4] - inicios[0]) / 4.0;
            if (p > PasoMax || p < PasoFirmaMin) return 0;
            for (int k = 0; k < 4; k++)
            {
                int largo = inicios[k + 1] - inicios[k];
                if (largo < p * 0.5 || largo > p * 1.6) return 0;
            }
            int fin = inicios[4] + 1;
            while (fin < ancho && f[fin] == ValoresMagia[4]) fin++;
            if (fin - inicios[4] < p * 0.5) return 0;
            return CoherenteFila(f, ancho, x, p) ? p : 0;
        }

        // Como afinar() de JS: ajusta x0 y el paso por mínimos cuadrados a los cambios de color de la fila (aquí solo hasta
        // las 16 celdas de la cabecera).
        static readonly int[] CeldasAfinar = { 3, 4, 6, 8, 12, 16 };
        static void Afinar(byte[] f, int ancho, ref double x0, ref double paso)
        {
            foreach (int maxCeldas in CeldasAfinar)
            {
                int xi = Math.Max(0, (int)Math.Floor(x0));
                if (xi >= ancho) return;
                int xFin = Math.Min(ancho, (int)Math.Floor(x0 + maxCeldas * paso));
                int n = 0, ultimoK = -1;
                double sk = 0, st = 0, skk = 0, skt = 0;
                int previo = f[xi];
                for (int x = xi + 1; x < xFin; x++)
                {
                    int v = f[x];
                    if (v == previo) continue;
                    double kf = (x - x0) / paso;
                    int k = (int)Math.Floor(kf + 0.5);
                    if (k >= 1 && Math.Abs(kf - k) < 0.35 && k != ultimoK) { n++; sk += k; st += x; skk += k * k; skt += k * x; ultimoK = k; }
                    previo = v;
                }
                if (n < 3) continue;
                double den = n * skk - sk * sk;
                if (den <= 0) continue;
                double p = (n * skt - sk * st) / den;
                double nx0 = (st - p * sk) / n;
                if (p > PasoMinDecodificar && p < PasoMax && Math.Abs(p - paso) < paso * 0.2) { paso = p; x0 = nx0; }
            }
        }

        // Ruling F4-30: los 6 primeros bytes (16 celdas de la primera fila, leídas en su centro) dan la magia 0x53 0x46
        // completa y una longitud de como mucho MAX_CARGA.
        static bool CabeceraValida(byte[] f, int ancho, double x0, double paso)
        {
            if (paso > PasoTope || paso < PasoMinDecodificar) return false;
            long acc = 0;
            for (int k = 0; k < 16; k++)
            {
                int x = (int)Math.Floor(x0 + (k + 0.5) * paso);
                if (x < 0 || x >= ancho) return false;
                acc = (acc << 3) | f[x];
            }
            int b0 = (int)((acc >> 40) & 0xff), b1 = (int)((acc >> 32) & 0xff);
            int len = (int)(acc & 0xffff);
            return b0 == 0x53 && b1 == 0x46 && len <= MaxCarga;
        }

        // Geometría de una firma: primero sin el primer tramo (el ruido de su izquierda puede alargarlo), afinada; si con
        // esa la cabecera no sale, la de la firma en bruto (como el «est» de JS).
        static bool Validar(byte[] f, int ancho, int x, int[] inicios, double pasoFirma, out double gx, out double gp)
        {
            gp = (inicios[4] - inicios[1]) / 3.0;
            gx = inicios[1] - gp;
            Afinar(f, ancho, ref gx, ref gp);
            if (CabeceraValida(f, ancho, gx, gp)) return true;
            gx = x;
            gp = pasoFirma;
            return CabeceraValida(f, ancho, gx, gp);
        }

        public sealed class Hallazgo
        {
            public int X, Y;     // primera celda de la magia, en coordenadas del cliente
            public double Paso;
        }

        // Busca en d (BGRA de w x h, que empieza en (ox, oy) del cliente) hasta maxValidas franjas válidas, por filas de
        // arriba abajo, probando como mucho MaxCandidatas firmas. Las firmas que caen dentro de una zona de «fuera»
        // (rectángulos del cliente: x, y, ancho, alto) o de un recorte ya hallado no cuentan.
        public static void BuscarValidas(byte[] d, int w, int h, int ox, int oy, int maxValidas, List<int[]> fuera,
            List<Hallazgo> salida, int anchoR, int altoR, int cw, int ch)
        {
            if (maxValidas <= 0) return;
            int primero = ValoresMagia[0];
            byte[] f = new byte[w];
            int[] inicios = new int[5];
            int probadas = 0;
            int validas = 0;
            List<int[]> hallados = new List<int[]>();
            for (int y = 0; y < h; y++)
            {
                ValoresFila(d, w, y, f);
                for (int x = 0; x < w; x++)
                {
                    if (f[x] != primero || (x > 0 && f[x - 1] == primero)) continue;
                    double p = FirmaEn(f, w, x, inicios);
                    if (p <= 0) continue;
                    if (dentro(ox + x, oy + y, fuera) || dentro(ox + x, oy + y, hallados)) continue;
                    if (++probadas > MaxCandidatas) return;
                    double gx, gp;
                    if (!Validar(f, w, x, inicios, p, out gx, out gp)) continue;
                    Hallazgo hz = new Hallazgo();
                    hz.X = ox + (int)Math.Floor(gx);
                    hz.Y = oy + y;
                    hz.Paso = gp;
                    salida.Add(hz);
                    int rx, ry, rw, rh;
                    RectanguloRecorte(hz.X, hz.Y, gp, cw, ch, anchoR, altoR, out rx, out ry, out rw, out rh);
                    hallados.Add(new int[] { rx, ry, rw, rh });
                    if (++validas >= maxValidas) return;
                }
            }
        }

        static bool dentro(int x, int y, List<int[]> rects)
        {
            if (rects == null) return false;
            foreach (int[] r in rects) if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return true;
            return false;
        }

        // ---------- recorte, hash y salida ----------

        public static byte[] Recortar(byte[] d, int ancho, int x0, int y0, int w, int h)
        {
            byte[] r = new byte[w * h * 4];
            for (int y = 0; y < h; y++) Buffer.BlockCopy(d, ((y0 + y) * ancho + x0) * 4, r, y * w * 4, w * 4);
            return r;
        }

        // FNV-1a de 32 bits del rectángulo (x0, y0, w, h) de d, sin copiarlo.
        static uint Fnv1aRect(byte[] d, int ancho, int x0, int y0, int w, int h)
        {
            uint hs = 2166136261;
            for (int y = 0; y < h; y++)
            {
                int p = ((y0 + y) * ancho + x0) * 4;
                int fin = p + w * 4;
                for (int i = p; i < fin; i++) { hs ^= d[i]; hs = unchecked(hs * 16777619); }
            }
            return hs;
        }

        static string Json(string s)
        {
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 0x20 || c > 0x7e) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        static readonly object Cerrojo = new object();
        static char[] bufferB64 = new char[0];

        static void Emitir(string linea)
        {
            lock (Cerrojo)
            {
                TextWriter o = Console.Out;
                o.Write(linea);
                o.Write('\n');
                o.Flush();
            }
        }

        // La línea de una imagen, escrita por trozos (el base64 va a un búfer reutilizado y se escribe tal cual, sin
        // concatenarlo en otra cadena).
        static void EmitirImagen(Envio e, string extra)
        {
            lock (Cerrojo)
            {
                int n = ((e.Datos.Length + 2) / 3) * 4;
                if (bufferB64.Length < n) bufferB64 = new char[n];
                Convert.ToBase64CharArray(e.Datos, 0, e.Datos.Length, bufferB64, 0);
                TextWriter o = Console.Out;
                o.Write("{\"t\":\"imagen\",\"ancho\":" + e.W + ",\"alto\":" + e.H + ",\"x0\":" + e.X0 + ",\"y0\":" + e.Y0 + extra + ",\"b64\":\"");
                o.Write(bufferB64, 0, n);
                o.Write("\"}\n");
                o.Flush();
            }
        }

        // Rectángulo del recorte (en coordenadas del cliente) para una magia en (mx, my) con celdas de «paso» px: anchoR x
        // altoR (440 x 60) con las celdas de 2 px del juego; desde 2,75 px (celdas de 3), crece en proporción, como mucho
        // x 1,5 (unos 660 x 90). El paso en bruto de una franja de 2 px puede salir 2,5 si el ruido de al lado alarga el
        // primer tramo: por eso no se escala por debajo de 2,75. Empieza 8 px antes de la magia y se recorta a los bordes.
        static void RectanguloRecorte(int mx, int my, double paso, int ancho, int alto, int anchoR, int altoR, out int x0, out int y0, out int w, out int h)
        {
            double escala = paso >= 2.75 ? Math.Min(paso / 2.0, 1.5) : 1.0;
            x0 = Math.Max(0, mx - 8);
            y0 = Math.Max(0, my - 8);
            w = Math.Min((int)Math.Ceiling(anchoR * escala), ancho - x0);
            h = Math.Min((int)Math.Ceiling(altoR * escala), alto - y0);
        }

        // ---------- Win32 ----------

        [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr valor);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT r);
        [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT p);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
        const uint GA_ROOTOWNER = 3;
        const uint WAIT_TIMEOUT = 0x102;

        static void ActivarDpi()
        {
            bool ok = false;
            try { ok = SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { }
            if (!ok) { try { SetProcessDPIAware(); } catch (Exception) { } }
        }

        // Un mapa de bits reutilizable para CopyFromScreen (se rehace si cambia el tamaño).
        sealed class Lienzo : IDisposable
        {
            public readonly int Ancho, Alto;
            public readonly Bitmap Mapa;
            public readonly Graphics G;
            public readonly byte[] Datos;
            public Lienzo(int w, int h)
            {
                Ancho = w; Alto = h;
                Mapa = new Bitmap(w, h, PixelFormat.Format32bppArgb);
                G = Graphics.FromImage(Mapa);
                Datos = new byte[w * h * 4];
            }
            public void Dispose() { G.Dispose(); Mapa.Dispose(); }
        }

        // Copia los píxeles de un mapa de bits a d (BGRA de arriba abajo, sin relleno), de una vez por fila.
        static void CopiarBits(Bitmap b, byte[] d)
        {
            int w = b.Width, h = b.Height;
            BitmapData bd = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int fila = w * 4;
                if (bd.Stride == fila) Marshal.Copy(bd.Scan0, d, 0, fila * h);
                else for (int y = 0; y < h; y++) Marshal.Copy(new IntPtr(bd.Scan0.ToInt64() + (long)y * bd.Stride), d, y * fila, fila);
            }
            finally { b.UnlockBits(bd); }
        }

        // De dónde salen los píxeles: un rectángulo (x, y, w, h) en coordenadas del cliente → BGRA de w x h. «entera» = el
        // cliente entero (usa su propio lienzo). El búfer devuelto se reutiliza en la siguiente copia del mismo tipo.
        // Situar da la esquina del cliente en la pantalla física. Pública para las pruebas (test/falso-captura/primer-plano.ps1).
        public interface IFuente
        {
            void Situar(int sx, int sy);
            byte[] Copiar(int x, int y, int w, int h, bool entera);
        }

        // La ventana del juego tal como la ve una vuelta (pública para las pruebas, que usan una falsa).
        public interface IVentana
        {
            string Exe { get; }
            bool Minimizado();
            bool PrimerPlano();
            bool Cliente(out int sx, out int sy, out int cw, out int ch);
        }

        // La pantalla, siempre dentro del área de cliente del juego.
        sealed class FuentePantalla : IFuente, IDisposable
        {
            int sx, sy;
            Lienzo grande, pequeno;
            public void Situar(int x, int y) { sx = x; sy = y; }
            public byte[] Copiar(int x, int y, int w, int h, bool entera)
            {
                Lienzo l = entera ? grande : pequeno;
                if (l == null || l.Ancho != w || l.Alto != h)
                {
                    if (l != null) l.Dispose();
                    l = new Lienzo(w, h);
                    if (entera) grande = l; else pequeno = l;
                }
                l.G.CopyFromScreen(sx + x, sy + y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
                CopiarBits(l.Mapa, l.Datos);
                return l.Datos;
            }
            public void Dispose()
            {
                if (grande != null) grande.Dispose();
                if (pequeno != null) pequeno.Dispose();
                grande = null; pequeno = null;
            }
        }

        // La imagen de -Archivo, como si fuera el cliente entero.
        public sealed class FuenteArchivo : IFuente
        {
            readonly byte[] d;
            readonly int ancho;
            public FuenteArchivo(byte[] datos, int w) { d = datos; ancho = w; }
            public void Situar(int x, int y) { }
            public byte[] Copiar(int x, int y, int w, int h, bool entera)
            {
                if (x == 0 && y == 0 && w == ancho && h * ancho * 4 == d.Length) return d;
                return Recortar(d, ancho, x, y, w, h);
            }
        }

        // La ventana de verdad (hwnd del juego).
        sealed class VentanaReal : IVentana
        {
            readonly IntPtr hwnd;
            readonly string exe;
            public VentanaReal(IntPtr h, string e) { hwnd = h; exe = e; }
            public string Exe { get { return exe; } }
            public bool Minimizado() { return IsIconic(hwnd); }
            public bool PrimerPlano()
            {
                IntPtr fg = GetForegroundWindow();
                IntPtr raiz = fg == IntPtr.Zero ? IntPtr.Zero : GetAncestor(fg, GA_ROOTOWNER);
                return EsPrimerPlano(fg, raiz, hwnd);
            }
            public bool Cliente(out int sx, out int sy, out int cw, out int ch)
            {
                sx = 0; sy = 0; cw = 0; ch = 0;
                RECT rc;
                POINT origen = new POINT();
                if (!GetClientRect(hwnd, out rc) || !ClientToScreen(hwnd, ref origen)) return false;
                sx = origen.X; sy = origen.Y; cw = rc.Right - rc.Left; ch = rc.Bottom - rc.Top;
                return true;
            }
        }

        // Ruling F4-28: solo se captura si el juego es la ventana de primer plano (o la raíz de esa ventana).
        public static bool EsPrimerPlano(IntPtr primerPlano, IntPtr raizPrimerPlano, IntPtr juego)
        {
            return juego != IntPtr.Zero && (primerPlano == juego || raizPrimerPlano == juego);
        }

        // Una pista: el último recorte de una franja (en coordenadas del cliente) y el hash del último recorte enviado.
        public sealed class Pista
        {
            public int X, Y, W, H;
            public bool HayHash;
            public uint Hash;
        }

        // Un recorte listo para enviar (se envía en Paso, después de comprobar que la vuelta vale).
        public sealed class Envio
        {
            public Pista P;
            public int X0, Y0, W, H;
            public byte[] Datos;
            public uint Hash;
        }

        // Lo que se recuerda entre vueltas. Reloj se cambia en las pruebas.
        public sealed class Seguimiento
        {
            public List<Pista> Pistas = new List<Pista>();
            public DateTime UltimoHallazgo = DateTime.MinValue;
            public DateTime ProximaCompleta = DateTime.MinValue;
            public string UltimoEstado;
            public Func<DateTime> Reloj = delegate { return DateTime.UtcNow; };
            public void Olvidar() { Pistas.Clear(); ProximaCompleta = DateTime.MinValue; }
            public void PonerPista(int x, int y, int w, int h)
            {
                Pista p = new Pista();
                p.X = x; p.Y = y; p.W = w; p.H = h;
                Pistas.Add(p);
            }
        }

        // Un paso del bucle con el juego encontrado: manda el estado si cambió y, solo si la ventana no está minimizada y
        // es la de primer plano, da una vuelta de captura. Si no lo es, no lee ningún píxel. Al acabar de copiar, vuelve a
        // mirar el primer plano y el cliente: si cambiaron, la vuelta no vale y no se envía nada. Devuelve cuánto esperar.
        public static int Paso(IVentana v, IFuente f, Seguimiento s, int anchoR, int altoR, int periodoMs, int periodoRapidoMs, int periodoEsperaMs)
        {
            bool minimizado = v.Minimizado();
            int sx, sy, cw, ch;
            if (!v.Cliente(out sx, out sy, out cw, out ch)) { cw = 0; ch = 0; }
            bool primerPlano = !minimizado && v.PrimerPlano();
            string estado = "{\"t\":\"estado\",\"juego\":\"si\",\"exe\":" + Json(v.Exe ?? "") + ",\"minimizado\":" +
                (minimizado ? "true" : "false") + ",\"primerPlano\":" + (primerPlano ? "true" : "false") +
                ",\"ancho\":" + cw + ",\"alto\":" + ch + "}";
            if (estado != s.UltimoEstado) { s.UltimoEstado = estado; Emitir(estado); s.Olvidar(); }
            if (minimizado || !primerPlano || cw <= 0 || ch <= 0) return periodoEsperaMs;

            Stopwatch vuelta = Stopwatch.StartNew();
            f.Situar(sx, sy);
            List<Envio> envios = new List<Envio>();
            try
            {
                bool porPista;
                Vuelta(f, cw, ch, anchoR, altoR, s, envios, out porPista);
            }
            catch (IOException) { throw; }  // ya nadie lee la salida: lo trata Ejecutar
            catch (Exception) { s.Olvidar(); envios.Clear(); } // p. ej. CopyFromScreen con el escritorio bloqueado

            int sx2, sy2, cw2, ch2;
            bool sigue = !v.Minimizado() && v.PrimerPlano() && v.Cliente(out sx2, out sy2, out cw2, out ch2) &&
                sx2 == sx && sy2 == sy && cw2 == cw && ch2 == ch;
            if (!sigue) { s.Olvidar(); envios.Clear(); }
            foreach (Envio e in envios) { EmitirImagen(e, ""); e.P.HayHash = true; e.P.Hash = e.Hash; }

            bool reciente = (s.Reloj() - s.UltimoHallazgo).TotalMilliseconds < 1000;
            return Math.Max(10, (reciente ? periodoRapidoMs : periodoMs) - (int)vuelta.ElapsedMilliseconds);
        }

        // Una vuelta: cada pista (su recorte anterior ampliado 16 px por lado) y, si no queda ninguna o han pasado 2 s desde
        // la última, el cliente entero (sin las zonas de las pistas). Deja en «envios» los recortes cuyo hash cambió.
        static bool Vuelta(IFuente f, int cw, int ch, int anchoR, int altoR, Seguimiento s, List<Envio> envios, out bool porPista)
        {
            porPista = false;
            DateTime ahora = s.Reloj();
            bool habiaPistas = s.Pistas.Count > 0;
            List<Pista> vivas = new List<Pista>();
            List<int[]> zonas = new List<int[]>();
            List<Hallazgo> hallazgos = new List<Hallazgo>();
            foreach (Pista p in s.Pistas)
            {
                int rx = Math.Max(0, p.X - 16), ry = Math.Max(0, p.Y - 16);
                int rw = Math.Min(cw, p.X + p.W + 16) - rx, rh = Math.Min(ch, p.Y + p.H + 16) - ry;
                if (rw <= 0 || rh <= 0) continue;
                byte[] d = f.Copiar(rx, ry, rw, rh, false);
                hallazgos.Clear();
                BuscarValidas(d, rw, rh, rx, ry, 1, zonas, hallazgos, anchoR, altoR, cw, ch);
                if (hallazgos.Count == 0) continue;
                porPista = true;
                Preparar(f, d, rx, ry, rw, rh, hallazgos[0], cw, ch, anchoR, altoR, p, envios);
                vivas.Add(p);
                zonas.Add(new int[] { p.X, p.Y, p.W, p.H });
            }
            // Se acaba de perder la pista: búsqueda completa enseguida. Sin pistas, solo cuando toca (ProximaCompleta).
            bool completa = (vivas.Count == 0 && habiaPistas) || ahora >= s.ProximaCompleta;
            if (completa)
            {
                s.ProximaCompleta = ahora.AddSeconds(2);
                byte[] d = f.Copiar(0, 0, cw, ch, true);
                hallazgos.Clear();
                BuscarValidas(d, cw, ch, 0, 0, MaxPistas - vivas.Count, zonas, hallazgos, anchoR, altoR, cw, ch);
                foreach (Hallazgo hz in hallazgos)
                {
                    Pista p = new Pista();
                    Preparar(f, d, 0, 0, cw, ch, hz, cw, ch, anchoR, altoR, p, envios);
                    vivas.Add(p);
                }
            }
            s.Pistas = vivas;
            // Una búsqueda completa sin nada: la siguiente, no antes de 250 ms. Así, en la gracia de 1 s a 100 ms tras perder
            // la franja, no se copia el cliente entero en cada vuelta (como mucho, cuatro veces por segundo).
            if (vivas.Count == 0)
            {
                if (completa) s.ProximaCompleta = ahora.AddMilliseconds(EsperaSinPistasMs);
                return false;
            }
            s.UltimoHallazgo = ahora;
            return true;
        }

        // Pone la pista en el recorte del hallazgo y, si su hash cambió, deja el recorte en «envios». El hash se calcula
        // sobre lo ya copiado (d, que empieza en (rx, ry) del cliente); si el recorte se sale de ahí, se copia solo él.
        static void Preparar(IFuente f, byte[] d, int rx, int ry, int rw, int rh, Hallazgo hz, int cw, int ch, int anchoR, int altoR,
            Pista p, List<Envio> envios)
        {
            int x0, y0, w, h;
            RectanguloRecorte(hz.X, hz.Y, hz.Paso, cw, ch, anchoR, altoR, out x0, out y0, out w, out h);
            p.X = x0; p.Y = y0; p.W = w; p.H = h;
            byte[] origen = d;
            int ox = x0 - rx, oy = y0 - ry, ancho = rw;
            if (!(x0 >= rx && y0 >= ry && x0 + w <= rx + rw && y0 + h <= ry + rh))
            {
                origen = f.Copiar(x0, y0, w, h, false);
                ox = 0; oy = 0; ancho = w;
            }
            uint hash = Fnv1aRect(origen, ancho, ox, oy, w, h);
            if (p.HayHash && hash == p.Hash) return;
            Envio e = new Envio();
            e.P = p; e.X0 = x0; e.Y0 = y0; e.W = w; e.H = h; e.Hash = hash;
            e.Datos = Recortar(origen, ancho, ox, oy, w, h);
            envios.Add(e);
        }

        static string Ms(Stopwatch reloj)
        {
            return reloj.Elapsed.TotalMilliseconds.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
        }

        // El proceso Wow.exe cuya ruta contiene \<carpeta>\ y que tiene ventana principal. La ruta se pide a WMI (no se
        // leen sus módulos). Para la ventana, Process.GetProcessById abre un handle de consulta limitada del proceso (solo
        // información: ni lee ni escribe su memoria) y MainWindowHandle enumera sus ventanas de primer nivel.
        static bool BuscarJuego(string carpeta, out uint pid, out IntPtr hwnd, out string exe)
        {
            pid = 0; hwnd = IntPtr.Zero; exe = null;
            string marca = "\\" + carpeta + "\\";
            try
            {
                using (ManagementObjectSearcher s = new ManagementObjectSearcher("SELECT ProcessId, ExecutablePath FROM Win32_Process WHERE Name = 'Wow.exe'"))
                using (ManagementObjectCollection lista = s.Get())
                {
                    foreach (ManagementBaseObject o in lista)
                    {
                        using (o)
                        {
                            string ruta = o["ExecutablePath"] as string;
                            if (ruta == null || ruta.IndexOf(marca, StringComparison.OrdinalIgnoreCase) < 0) continue;
                            uint id = Convert.ToUInt32(o["ProcessId"]);
                            try
                            {
                                using (Process p = Process.GetProcessById((int)id))
                                {
                                    IntPtr h = p.MainWindowHandle;
                                    if (h == IntPtr.Zero) continue;
                                    pid = id; hwnd = h; exe = ruta;
                                    return true;
                                }
                            }
                            catch (Exception) { }
                        }
                    }
                }
            }
            catch (Exception) { }
            return false;
        }

        static bool VentanaViva(IntPtr hwnd, uint pid)
        {
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return false;
            uint dueno;
            GetWindowThreadProcessId(hwnd, out dueno);
            return dueno == pid;
        }

        // ---------- modo -Archivo ----------

        // Procesa la imagen con las mismas vueltas que la pantalla (repetir veces: de la segunda en adelante, con pista).
        // Con repetir > 1, termina con {"t":"fin","vueltas","conPista","ms":[…]}.
        static int ModoArchivo(string ruta, int anchoR, int altoR, int repetir)
        {
            Bitmap b;
            try { b = new Bitmap(ruta); }
            catch (Exception e) { Emitir("{\"t\":\"error\",\"texto\":" + Json(e.Message) + "}"); return 2; }
            int w, h;
            byte[] d;
            using (b)
            {
                w = b.Width; h = b.Height;
                d = new byte[w * h * 4];
                CopiarBits(b, d);
            }
            FuenteArchivo f = new FuenteArchivo(d, w);
            Seguimiento s = new Seguimiento();
            bool alguna = false;
            int conPista = 0;
            StringBuilder tiempos = new StringBuilder();
            for (int i = 0; i < Math.Max(1, repetir); i++)
            {
                Stopwatch reloj = Stopwatch.StartNew();
                List<Envio> envios = new List<Envio>();
                bool porPista;
                if (Vuelta(f, w, h, anchoR, altoR, s, envios, out porPista)) alguna = true;
                if (porPista) conPista++;
                string ms = Ms(reloj);
                foreach (Envio e in envios) { EmitirImagen(e, ",\"ms\":" + ms); e.P.HayHash = true; e.P.Hash = e.Hash; }
                if (tiempos.Length > 0) tiempos.Append(',');
                tiempos.Append(ms);
                if (!alguna && i == 0) Emitir("{\"t\":\"nada\",\"ms\":" + ms + "}");
            }
            if (repetir > 1) Emitir("{\"t\":\"fin\",\"vueltas\":" + repetir + ",\"conPista\":" + conPista + ",\"ms\":[" + tiempos + "]}");
            return 0;
        }

        // ---------- bucle de captura ----------

        // El proceso padre y su handle, guardados al empezar: mientras este proceso viva, su PID no se puede reutilizar.
        static Process padre;
        static IntPtr handlePadre;

        public static int Ejecutar(int padrePid, string archivo, int anchoR, int altoR, int periodoMs, int periodoRapidoMs,
            int periodoEsperaMs, string carpeta, int repetir)
        {
            ActivarDpi();
            Emitir("{\"t\":\"listo\",\"version\":1}");
            if (!string.IsNullOrEmpty(archivo)) return ModoArchivo(archivo, anchoR, altoR, repetir);
            if (padrePid <= 0) return 2;

            try { padre = Process.GetProcessById(padrePid); handlePadre = padre.Handle; }
            catch (Exception) { return 0; }

            uint pid = 0;
            IntPtr hwnd = IntPtr.Zero;
            string exe = null;
            VentanaReal ventana = null;
            DateTime proximaBusquedaJuego = DateTime.MinValue;
            Seguimiento s = new Seguimiento();
            using (FuentePantalla pantalla = new FuentePantalla())
            {
                while (true)
                {
                    if (WaitForSingleObject(handlePadre, 0) != WAIT_TIMEOUT) return 0;

                    if (!VentanaViva(hwnd, pid))
                    {
                        hwnd = IntPtr.Zero;
                        ventana = null;
                        s.Olvidar();
                        pantalla.Dispose();
                        DateTime ahora = DateTime.UtcNow;
                        if (ahora >= proximaBusquedaJuego)
                        {
                            proximaBusquedaJuego = ahora.AddSeconds(5);
                            if (!BuscarJuego(carpeta, out pid, out hwnd, out exe)) hwnd = IntPtr.Zero;
                        }
                        if (hwnd == IntPtr.Zero)
                        {
                            if (s.UltimoEstado != "no")
                            {
                                s.UltimoEstado = "no";
                                try { Emitir("{\"t\":\"estado\",\"juego\":\"no\"}"); } catch (IOException) { return 0; }
                            }
                            Thread.Sleep(500);
                            continue;
                        }
                        ventana = new VentanaReal(hwnd, exe);
                    }

                    int espera;
                    try { espera = Paso(ventana, pantalla, s, anchoR, altoR, periodoMs, periodoRapidoMs, periodoEsperaMs); }
                    catch (IOException) { return 0; }
                    Thread.Sleep(espera);
                }
            }
        }
    }
}
'@

Add-Type -TypeDefinition $codigo -Language CSharp -ReferencedAssemblies 'System.Drawing', 'System.Management'

$ruta = ''
if ($Archivo) { $ruta = [System.IO.Path]::GetFullPath($Archivo) }
exit ([SnetForever.Captura]::Ejecutar($PadrePid, $ruta, $Ancho, $Alto, $PeriodoMs, $PeriodoRapidoMs, $PeriodoEsperaMs, $Carpeta, $Repetir))
