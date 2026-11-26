# Arnés de prueba del bucle en vivo de captura.ps1 (solo para captura.test.js): compila su C# junto con una ventana
# FALSA, una fuente que cuenta las copias (lee la imagen de -Bmp, nunca la pantalla) y un reloj falso, y ejecuta
# Captura.Paso. Modos:
# - primerPlano (Ruling F4-28): fuera de primer plano o minimizada no se copia ningún píxel ni se envía ninguna imagen;
# - cambiaDurante (F4-30): si el juego deja de estar delante mientras se copia, la vuelta no envía nada;
# - pistaFalsa (F4-30): con la pista puesta sobre un falso positivo (en -FalsoX, -FalsoY), la búsqueda completa de cada
#   2 s encuentra la franja real;
# - graciaSinPistas (revisión final, Minor 9): recién perdida la franja, como mucho una copia completa cada 250 ms.
# Salida: las líneas de Captura (estado, imagen) intercaladas con {"t":"copias"}, {"t":"vuelta"} y {"t":"esPrimerPlano"}.
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [Parameter(Mandatory = $true)][string]$Bmp,
  [string]$Modo = 'primerPlano',
  [int]$FalsoX = 0,
  [int]$FalsoY = 0
)
$ErrorActionPreference = 'Stop'

$texto = [System.IO.File]::ReadAllText($Script)
$i = $texto.IndexOf("@'")
$j = $texto.IndexOf("`n'@")
$codigo = $texto.Substring($i + 2, $j - $i - 2)

$falsos = @'

namespace SnfPrueba
{
    public sealed class VentanaFalsa : SnetForever.Captura.IVentana
    {
        public bool Min, Pp;
        public int W, H;
        public string Exe { get { return "E:\\wow\\_forever_\\Wow.exe"; } }
        public bool Minimizado() { return Min; }
        public bool PrimerPlano() { return Pp; }
        public bool Cliente(out int sx, out int sy, out int cw, out int ch) { sx = 100; sy = 50; cw = W; ch = H; return true; }
    }

    public sealed class FuenteContada : SnetForever.Captura.IFuente
    {
        readonly SnetForever.Captura.FuenteArchivo f;
        public int Copias;
        public int Completas; // copias del cliente entero
        public VentanaFalsa QuitarPrimerPlano; // si no es null, cada copia saca al juego del primer plano
        public FuenteContada(byte[] d, int w) { f = new SnetForever.Captura.FuenteArchivo(d, w); }
        public void Situar(int x, int y) { }
        public byte[] Copiar(int x, int y, int w, int h, bool entera)
        {
            Copias++;
            if (entera) Completas++;
            if (QuitarPrimerPlano != null) QuitarPrimerPlano.Pp = false;
            return f.Copiar(x, y, w, h, entera);
        }
    }

    public static class Prueba
    {
        static void Linea(string s) { System.Console.Out.Write(s + "\n"); System.Console.Out.Flush(); }

        static byte[] Leer(string ruta, out int w, out int h)
        {
            using (System.Drawing.Bitmap b = new System.Drawing.Bitmap(ruta))
            {
                w = b.Width; h = b.Height;
                byte[] d = new byte[w * h * 4];
                System.Drawing.Imaging.BitmapData bd = b.LockBits(new System.Drawing.Rectangle(0, 0, w, h),
                    System.Drawing.Imaging.ImageLockMode.ReadOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                for (int y = 0; y < h; y++)
                    System.Runtime.InteropServices.Marshal.Copy(new System.IntPtr(bd.Scan0.ToInt64() + (long)y * bd.Stride), d, y * w * 4, w * 4);
                b.UnlockBits(bd);
                return d;
            }
        }

        static int Paso(VentanaFalsa v, FuenteContada f, SnetForever.Captura.Seguimiento s)
        {
            return SnetForever.Captura.Paso(v, f, s, 440, 60, 1000, 100, 250);
        }

        public static void Correr(string ruta, string modo, int falsoX, int falsoY)
        {
            int w, h;
            byte[] d = Leer(ruta, out w, out h);
            VentanaFalsa v = new VentanaFalsa();
            v.W = w; v.H = h;
            FuenteContada f = new FuenteContada(d, w);
            SnetForever.Captura.Seguimiento s = new SnetForever.Captura.Seguimiento();
            System.DateTime t0 = new System.DateTime(2026, 11, 10, 12, 0, 0, System.DateTimeKind.Utc);
            System.DateTime t = t0;
            s.Reloj = delegate { return t; };

            if (modo == "primerPlano")
            {
                // 1-2: fuera de primer plano, dos veces; 3: en primer plano; 4: otra vez fuera; 5: minimizado.
                bool[][] pasos = { new bool[] { false, false }, new bool[] { false, false }, new bool[] { false, true }, new bool[] { false, false }, new bool[] { true, true } };
                foreach (bool[] p in pasos)
                {
                    v.Min = p[0]; v.Pp = p[1];
                    int espera = Paso(v, f, s);
                    Linea("{\"t\":\"copias\",\"n\":" + f.Copias + ",\"espera\":" + espera + "}");
                }
                System.IntPtr a = new System.IntPtr(11), r = new System.IntPtr(22), otra = new System.IntPtr(33), z = System.IntPtr.Zero;
                bool[] casos = {
                    SnetForever.Captura.EsPrimerPlano(a, a, a),      // el juego mismo
                    SnetForever.Captura.EsPrimerPlano(otra, a, a),   // un diálogo propio del juego (su raíz es el juego)
                    SnetForever.Captura.EsPrimerPlano(otra, r, a),   // otra ventana
                    SnetForever.Captura.EsPrimerPlano(z, z, a),      // ninguna
                    SnetForever.Captura.EsPrimerPlano(z, z, z),      // sin juego
                };
                System.Text.StringBuilder sb = new System.Text.StringBuilder();
                foreach (bool c in casos) { if (sb.Length > 0) sb.Append(','); sb.Append(c ? "true" : "false"); }
                Linea("{\"t\":\"esPrimerPlano\",\"casos\":[" + sb + "]}");
            }
            else if (modo == "cambiaDurante")
            {
                v.Pp = true;
                f.QuitarPrimerPlano = v;
                Paso(v, f, s);
                Linea("{\"t\":\"copias\",\"n\":" + f.Copias + "}");
            }
            else if (modo == "pistaFalsa")
            {
                v.Pp = true;
                Paso(v, new FuenteContada(new byte[w * h * 4], w), s); // estado; nada que ver en una imagen negra
                s.Olvidar();
                s.PonerPista(falsoX - 8, falsoY - 8, 440, 60);
                s.ProximaCompleta = t0.AddSeconds(2);
                foreach (int ms in new int[] { 0, 1000, 2100 })
                {
                    t = t0.AddMilliseconds(ms);
                    Paso(v, f, s);
                    Linea("{\"t\":\"vuelta\",\"ms\":" + ms + "}");
                }
            }
            else if (modo == "graciaSinPistas")
            {
                // Revisión final, Minor 9: la franja se acaba de perder (había una pista y la imagen ya está negra). Vueltas
                // cada 100 ms durante 1,2 s: como mucho una copia completa cada 250 ms (antes, una en cada vuelta).
                v.Pp = true;
                FuenteContada negra = new FuenteContada(new byte[w * h * 4], w);
                Paso(v, negra, s); // estado (y su primera búsqueda, que no cuenta)
                negra.Completas = 0;
                s.Olvidar();
                s.PonerPista(600, 300, 440, 60);
                s.UltimoHallazgo = t0;
                s.ProximaCompleta = t0.AddSeconds(2);
                for (int ms = 0; ms <= 1200; ms += 100)
                {
                    t = t0.AddMilliseconds(ms);
                    int espera = Paso(v, negra, s);
                    Linea("{\"t\":\"vuelta\",\"ms\":" + ms + ",\"completas\":" + negra.Completas + ",\"espera\":" + espera + "}");
                }
            }
        }
    }
}
'@

Add-Type -TypeDefinition ($codigo + $falsos) -Language CSharp -ReferencedAssemblies 'System.Drawing', 'System.Management'
[SnfPrueba.Prueba]::Correr([System.IO.Path]::GetFullPath($Bmp), $Modo, $FalsoX, $FalsoY)
