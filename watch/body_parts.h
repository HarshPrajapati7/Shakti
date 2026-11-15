#ifndef BODY_PARTS_H
#define BODY_PARTS_H

#include <Arduino.h>

#ifdef __cplusplus
extern "C" {
#endif

extern const unsigned short Background[28900];
extern const unsigned short face[28900];
extern const unsigned short head[28900];
extern const unsigned short neck[28900];
extern const unsigned short left_chest[28900];
extern const unsigned short right_chest[28900];
extern const unsigned short stomach[28900];
extern const unsigned short left_shoulder[28900];
extern const unsigned short right_shoulder[28900];
extern const unsigned short left_biceps[28900];
extern const unsigned short right_biceps[28900];
extern const unsigned short left_fore_arm[28900];
extern const unsigned short right_fore_arm[28900];
extern const unsigned short left_palm[28900];
extern const unsigned short right_palm[28900];
extern const unsigned short left_thigh[28900];
extern const unsigned short right_thigh[28900];
extern const unsigned short left_knee[28900];
extern const unsigned short right_knee[28900];
extern const unsigned short left_leg[28900];
extern const unsigned short right_leg[28900];
extern const unsigned short left_foot[28900];
extern const unsigned short right_foot[28900];

#ifdef __cplusplus
}
#endif

struct BodyPartMapping {
  const char* name;
  const unsigned short* data;
};

const BodyPartMapping BODY_PARTS[] = {
  { "head", head },
  { "face", face },
  { "neck", neck },
  { "left_chest", left_chest },
  { "right_chest", right_chest },
  { "stomach", stomach },
  { "left_shoulder", left_shoulder },
  { "right_shoulder", right_shoulder },
  { "left_biceps", left_biceps },
  { "right_biceps", right_biceps },
  { "left_fore_arm", left_fore_arm },
  { "right_fore_arm", right_fore_arm },
  { "left_palm", left_palm },
  { "right_palm", right_palm },
  { "left_thigh", left_thigh },
  { "right_thigh", right_thigh },
  { "left_knee", left_knee },
  { "right_knee", right_knee },
  { "left_leg", left_leg },
  { "right_leg", right_leg },
  { "left_foot", left_foot },
  { "right_foot", right_foot }
};

const int NUM_BODY_PARTS = sizeof(BODY_PARTS) / sizeof(BODY_PARTS[0]);

inline const unsigned short* getBodyPartByName(const char* name) {
  for (int i = 0; i < NUM_BODY_PARTS; i++) {
    if (strcmp(BODY_PARTS[i].name, name) == 0) {
      return BODY_PARTS[i].data;
    }
  }
  return nullptr;
}

#endif // BODY_PARTS_H

