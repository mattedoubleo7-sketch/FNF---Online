// Automatically converted with https://github.com/TheLeerName/ShadertoyToFlixel

#pragma header

#define round(a) floor(a + 0.5)
#define texture flixel_texture2D
#define iResolution openfl_TextureSize
uniform float iTime;
#define iChannel0 bitmap
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

float baseline_alpha = 0.10;	//the alpha value of dots in their "off" state, does not affect the border region of the screen - [0, 1]
float response_time = 0.333;	//simulate response time, higher values result in longer color transition periods - [0, 1]

vec3 bg_col = vec3(0.63, 0.67, 0.02);
vec3 fg_col = vec3(0.11, 0.42, 0.42);

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    float vx_offset = 1.5;// Horizontal limit of where to stop the effect
    float pixel_w = 10.0;// Pixelise width
    float pixel_h = 10.0;// Pixelise height
    
	vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 sampleSize = vec2(1.0 / iResolution.x, 1.0 / iResolution.y);
    vec3 color = vec3(1.0, 0.0, 0.0);
    
    if (uv.x < (vx_offset - 0.005))
    {
        float dx = pixel_w * sampleSize.x;
        float dy = pixel_h * sampleSize.y;
        vec2 coord = vec2(dx * floor(uv.x/dx), dy * floor(uv.y/dy));
        color = texture(iChannel0, coord).rgb;
    }
    else if (uv.x >= (vx_offset + 0.005))
    {
        color = texture(iChannel0, uv).rgb;
    }
    
    //Check if luminosity too high and higher luminosity = apply bg_color else apply fg
    if (dot(color, vec3(1.0, 1.0, 1.0)) > 0.9 )
        color = bg_col;
    else 
        color = fg_col;
	fragColor = vec4(color, texture(iChannel0, uv).a);
}

void main() {
	mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}