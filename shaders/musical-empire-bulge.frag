#pragma header

uniform float iTime;
uniform float SPEED;
uniform float INTENSITY;

void main()
{
    vec2 uv = openfl_TextureCoordv;

    // Convert to centered coordinates for distortion calculations
    vec2 centeredUV = (uv - 0.5) * 2.0;

    float t = iTime * SPEED;

    vec2 fishuv;

    float fishyness = 0.2 * INTENSITY;

    fishuv.x = (1.0 - centeredUV.y * centeredUV.y) * fishyness * centeredUV.x;
    fishuv.y = (1.0 - centeredUV.x * centeredUV.x) * fishyness * centeredUV.y;

    // Convert distortion back to texture-coordinate scale
    vec2 distortion = fishuv * 0.5;

    // Fisheye Chromatic Aberration
    float cr = flixel_texture2D(bitmap, uv - distortion * 0.95).r;
    vec2 cgb = flixel_texture2D(bitmap, uv - distortion).gb;

    vec3 c = vec3(cr, cgb);

    // Vignette
    float uvMagSqrd = dot(centeredUV, centeredUV);
    float vignette = 1.0 - uvMagSqrd * fishyness;

    c *= vignette;

    gl_FragColor = vec4(c, 1.0);
}