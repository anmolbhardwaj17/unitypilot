using System.Linq;
using McpUnity.Unity;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace McpUnity.Tools
{
    /// <summary>
    /// FORK (unity-mcp-orchestrator, Phase 6b): the visual feedback channel. Renders a camera
    /// to a PNG and returns it base64-encoded so the agent (and the human) can see the scene.
    ///
    /// Camera resolution: an explicitly named camera → Camera.main → any active camera →
    /// the SceneView camera (so an empty scene still yields the editor's-eye view). Rendering
    /// needs a GPU, so this is unavailable under `-nographics` (headless) and returns a clear
    /// error there. Runs synchronously on the main thread (the dispatcher's coroutine / pump).
    /// </summary>
    public class ScreenshotTool : McpToolBase
    {
        public ScreenshotTool()
        {
            Name = "screenshot";
            Description = "Render a camera to a PNG image (base64). Optional: camera (GameObject name), "
                          + "width, height, mode ('game'|'scene'). Interactive only (needs a GPU).";
        }

        public override JObject Execute(JObject parameters)
        {
            // -nographics has no usable graphics device; rendering would produce nothing.
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null)
            {
                return McpUnitySocketHandler.CreateErrorResponse(
                    "Screenshots need a GPU — the editor is running headless (-nographics). "
                        + "Relaunch interactively (the default) to capture the view.",
                    "screenshot_unavailable_headless");
            }

            int width = Mathf.Clamp(GetIntParameter(parameters, "width", 1280), 16, 3840);
            int height = Mathf.Clamp(GetIntParameter(parameters, "height", 720), 16, 2160);
            string cameraName = parameters?["camera"]?.ToString();
            string mode = parameters?["mode"]?.ToString();
            if (string.IsNullOrWhiteSpace(mode)) mode = "game";

            Camera camera = ResolveCamera(cameraName, mode, out string source);
            if (camera == null)
            {
                return McpUnitySocketHandler.CreateErrorResponse(
                    string.IsNullOrEmpty(cameraName)
                        ? "No camera to render (no Camera.main and no SceneView open)."
                        : $"No camera named '{cameraName}' found in the scene.",
                    "camera_not_found");
            }

            RenderTexture rt = RenderTexture.GetTemporary(width, height, 24);
            RenderTexture prevTarget = camera.targetTexture;
            RenderTexture prevActive = RenderTexture.active;
            Texture2D tex = null;
            try
            {
                camera.targetTexture = rt;
                camera.Render();

                RenderTexture.active = rt;
                tex = new Texture2D(width, height, TextureFormat.RGB24, false);
                tex.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                tex.Apply();

                byte[] png = tex.EncodeToPNG();
                string base64 = System.Convert.ToBase64String(png);

                return new JObject
                {
                    ["success"] = true,
                    ["type"] = "image",
                    ["mimeType"] = "image/png",
                    ["data"] = base64,
                    ["width"] = width,
                    ["height"] = height,
                    ["source"] = source,
                    ["bytes"] = png.Length
                };
            }
            finally
            {
                camera.targetTexture = prevTarget;
                RenderTexture.active = prevActive;
                RenderTexture.ReleaseTemporary(rt);
                if (tex != null) Object.DestroyImmediate(tex);
            }
        }

        /// <summary>
        /// Pick a camera to render and report where it came from. Named camera wins; then for
        /// 'scene' mode the SceneView camera; for 'game' mode Camera.main / any camera, falling
        /// back to the SceneView camera so an empty scene still produces a useful image.
        /// </summary>
        private static Camera ResolveCamera(string cameraName, string mode, out string source)
        {
            if (!string.IsNullOrWhiteSpace(cameraName))
            {
                GameObject go = GameObject.Find(cameraName);
                Camera cam = go != null ? go.GetComponent<Camera>() : null;
                if (cam != null)
                {
                    source = $"named:{cameraName}";
                    return cam;
                }
                source = null;
                return null;
            }

            if (mode == "scene")
            {
                Camera sv = SceneView.lastActiveSceneView != null ? SceneView.lastActiveSceneView.camera : null;
                source = sv != null ? "scene" : null;
                return sv;
            }

            // mode == "game"
            if (Camera.main != null)
            {
                source = "game:Camera.main";
                return Camera.main;
            }
            Camera any = Camera.allCameras.FirstOrDefault();
            if (any != null)
            {
                source = $"game:{any.name}";
                return any;
            }
            // Fall back to the editor's Scene view so we still return something useful.
            Camera fallback = SceneView.lastActiveSceneView != null ? SceneView.lastActiveSceneView.camera : null;
            source = fallback != null ? "scene(fallback)" : null;
            return fallback;
        }

        private static int GetIntParameter(JObject parameters, string key, int defaultValue)
        {
            if (parameters?[key] != null && int.TryParse(parameters[key].ToString(), out int value))
                return value;
            return defaultValue;
        }
    }
}
