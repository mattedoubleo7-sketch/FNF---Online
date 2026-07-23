#pragma header
uniform float iTime;
uniform float xSpeed;
uniform float ySpeed;
uniform float timeMulti;

void main() {
vec2 uv = openfl_TextureCoordv.xy;
vec2 fragCoord = openfl_TextureCoordv * openfl_TextureSize;
vec2 iResolution = openfl_TextureSize;
    // Time
    float time = iTime * timeMulti;
    
    // Calculate coordinates with time-based offset
    float xCoord = floor(fragCoord.x + time * xSpeed * iResolution.x);
    float yCoord = floor(fragCoord.y + time * ySpeed * iResolution.y);
    
    // Ensure coordinates are within texture bounds
    vec2 coord = mod(vec2(xCoord, yCoord), iResolution.xy);
 
    // Normalize coordinates
	vec2 uwu = coord / iResolution.xy;
    
    // Sample texture color
    vec4 texColor = flixel_texture2D(bitmap, uwu);
    
    // Output to screen
    gl_FragColor = texColor;
}