precision highp float;
uniform vec2  resolution;     // resolution (width, height)
uniform float time;           // time       (1second == 1.0)

// consts
const float INF = 1e+10;
const float EPS = 1e-3;
const float EPS_N = 1e-4;
const float OFFSET = EPS * 10.0;

const float PI = 3.14159265359;
const float PI2 = 6.28318530718;
const float PIH = 1.57079632679;
const float PIQ = 0.78539816339;

const float MAX_STEPS = 80.0;
const float MAX_DISTANCE = 100.0;
const float SHADOW_RAY_OFFSET_LENGTH = 0.001;

const float FOG_DENSITY = 0.05;

// utils
mat2 rotate(in float a)
{
  float s = sin(a), c = cos(a);
  return mat2(c, s, -s, c);
}

#define calcNormal(p, dFunc) normalize(vec2(EPS_N, -EPS_N).xyy * dFunc(p + vec2(EPS_N, -EPS_N).xyy) + vec2(EPS_N, -EPS_N).yyx * dFunc(p + vec2(EPS_N, -EPS_N).yyx ) + vec2(EPS_N, -EPS_N).yxy * dFunc(p + vec2(EPS_N, -EPS_N).yxy) + vec2(EPS_N, -EPS_N).xxx * dFunc(p + vec2(EPS_N, -EPS_N).xxx))
#define saturate(x) clamp(x, 0.0, 1.0)

// globals
const vec3 lightDir = vec3(-0.577, 0.977, 0.577);
const vec3 skyColor = vec3(0, 0.0625, 0.265625);

// structs
struct Ray
{
  vec3 origin;
  vec3 direction;
};

struct Camera
{
  vec3 eye;
  vec3 target;
  vec3 forward;
  vec3 right;
  vec3 up;
  float zoom;
};

struct Intersection
{
    bool hit;
    vec3 pos;
    float count;
    float distance;

    vec3 color;
};

// Create Ray from Camera.
Ray cameraShootRay(Camera c, vec2 uv)
{
  c.forward = normalize(c.target - c.eye);
  c.right = normalize(cross(c.forward, c.up));
  c.up = normalize(cross(c.right, c.forward));

  Ray r;
  r.origin = c.eye;
  r.direction = normalize(uv.x * c.right + uv.y * c.up + c.zoom * c.forward);

  return r;
}

// Distance Functions
float sdBox(vec3 p, vec3 b)
{
  vec3 d = abs(p) - b;
  return length(max(d,0.0))
         + min(max(d.x,max(d.y,d.z)),0.0);
}

float dMenger(vec3 p)
{
  p *= 1.0;
  p.y -= (1.0-cos(time)) * 0.5;
  p.xz = p.xz * rotate(sin(p.y * 1.0) * (0.5+0.5*-cos(time)));
  p.xy = p.xy * rotate(sin(p.z * 1.0) * (0.5+0.5*-cos(time)));

  float d = sdBox(p, vec3(1.0 + (1.0-cos(time)) * 0.5));

  float anim = smoothstep(-0.2, 0.2, -cos(time));
  float scale = 0.3 + (0.5+0.5*-cos(time)) * 1.3;
  p.xy = mix(p.xy, p.xy * rotate(PI/2.5) * scale,  anim);
  p.xz = mix(p.xz, p.xz * rotate(PI/2.5) * scale,  anim);

  float s = 1.0;
  for(float itr = 0.0; itr < 4.0; itr++)
  {
    vec3 stepedRel = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(stepedRel));

    // cross
    float dirA = max(r.x, r.y);
    float dirB = max(r.y, r.z);
    float dirC = max(r.z, r.x);
    float c = (min(dirA, min(dirB, dirC)) - 1.0) / s;

    d = max(d, c);
  }
  return d / 2.0;
}

float dPlane(vec3 p)
{
  const vec4 N = vec4(0.0, 1.0, 0.0, 1.0);
  return dot(p, N.xyz) + N.w;
}

float dObjects(vec3 p)
{
  float d = dMenger(p);
  d = min(d, dPlane(p));
  return d;
}

// materials

// Menger ===========================================================

const float SHADOW_INTENSITY = 0.6;
const float SHADOW_SHARPNESS = 50.0;
float getMengerShadow(vec3 ro, vec3 rd, float marchingSpeed)
{
  float dist = INF;
  float depth = EPS;
  float bright = 1.0;
  for(float i = 0.0; i < 50.0; i++)
  {
    dist = dMenger(ro + rd * depth);
    if(dist < EPS) return 1.0 - SHADOW_INTENSITY;
    bright = min(bright, dist * SHADOW_SHARPNESS / sqrt(depth));
    depth += dist * marchingSpeed;
  }
  return 1.0 - (1.0 - bright) * SHADOW_INTENSITY;
}

float genScreenSpaceAO(float marchingCount, float intensity)
{
  return 1.0 - (marchingCount / MAX_STEPS * intensity);
}

void intersectMenger(inout Intersection intersection)
{
  const vec3 ALBEDO = vec3(1.0);

  vec3 nor = calcNormal(intersection.pos, dMenger);
  float diff = max(0.1 + 0.9*dot(nor, lightDir), 0.0);
  float occ = genScreenSpaceAO(intersection.count, 1.5);
  float shadow = getMengerShadow(intersection.pos + nor * SHADOW_RAY_OFFSET_LENGTH, lightDir, 1.0);
  float sky = 0.5+0.5*nor.y;

  float shade = 0.0;
  shade += 0.5 * diff * shadow;
  shade += 2.75 * pow(occ, 2.0);
  shade += 2.0 * sky;
  shade *= 1.2;
  shade = saturate(shade);

  intersection.color =  mix(skyColor, ALBEDO * shade, sqrt(occ));
}

// https://qiita.com/edo_m18/items/63dbacb57db3b7734483
vec4 genObjectsAmbientOcclusion(vec3 ro, vec3 rd)
{
    vec4 totalAO = vec4(0.0);
    float sca = 1.0;

    for (int aoI = 0; aoI < 5; aoI++)
    {
        float ray2nd = 0.001 + 0.1 * float(aoI * aoI);
        vec3 aoPos = ro + rd * ray2nd;
        float distRes = dObjects(aoPos);
        float ao = clamp(-(distRes - ray2nd), 0.0, 1.0);
        totalAO += ao * sca * vec4(1.0, 1.0, 1.0, 1.0);
        sca *= 0.1;
    }

    const float AO_COEF = 0.3;
    totalAO.w = 1.0 - clamp(AO_COEF * totalAO.w, 0.0, 1.0);

    return totalAO;
}

void intersectPlane(inout Intersection intersection)
{
  const vec3 ALBEDO = vec3(1.0);
  vec3 nor = calcNormal(intersection.pos, dPlane);
  float diff = max(0.1 + 0.9*dot(nor, lightDir), 0.0);
  float fog = saturate(1.0 / exp(pow(abs(intersection.distance) * FOG_DENSITY, 10.0)));
  vec4 occ = genObjectsAmbientOcclusion(intersection.pos, calcNormal(intersection.pos, dObjects));
  occ.w = occ.w * 10.0;
  float shadow = getMengerShadow(intersection.pos + nor * SHADOW_RAY_OFFSET_LENGTH, lightDir, 2.0);

  float shade = 0.0;
  shade += 1.0 * diff * shadow;
  shade = saturate(shade);

  intersection.color = mix(skyColor, ALBEDO * shade - occ.xyz * occ.w, fog);
}

// main processes

void intersectObjects(inout Intersection intersection, inout Ray ray)
{
  float d;
  float distance = 0.0;
  vec3 p = ray.origin;

  for(float i = 0.0; i < MAX_STEPS; i++)
  {
    d = dObjects(p);
    distance += d;
    p = ray.origin + distance * ray.direction;
    intersection.count = i;
    if(abs(d) < EPS || MAX_DISTANCE < distance) break;
  }

  if(abs(d) < EPS && distance < intersection.distance)
  {
    intersection.distance = distance;
    intersection.pos = p;
    intersection.hit = true;

    // hit
    if(abs(dMenger(p)) < EPS)
    {
      intersectMenger(intersection);
    }
    else if(abs(dPlane(p)) < EPS)
    {
      intersectPlane(intersection);
    }
  }
}

void intersectScene(inout Intersection intersection, inout Ray ray)
{
  intersection.distance = INF;
  intersectObjects(intersection, ray);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);

    // camera & ray
    vec2 cameraPV = vec2(0.3 + sin(time) * 0.25, -0.7);
    float cameraR = 9.0;
    Camera camera;
    camera.eye.x = cameraR * sin(cameraPV.y * PIH) * cos(cameraPV.x * PI + PI);
    camera.eye.z = cameraR * sin(cameraPV.y * PIH) * sin(cameraPV.x * PI + PI);
    camera.eye.y = cameraR * cos(cameraPV.y * PIH);
    camera.target = vec3(0.0, 0.1, 0.0);
    camera.up = vec3(0.0, 1.0, 0.0); // y-up
    camera.zoom = 3.0;

    Ray ray = cameraShootRay(camera, uv);

    vec3 color = vec3(0.0);
    Intersection intersection;
    intersection.color = skyColor;

    intersectScene(intersection, ray);

    if(intersection.hit)
    {
      color = intersection.color;
    }
    else
    {
      color = skyColor;
    }

    gl_FragColor = vec4(color, 1.0);
}